"use server";

/**
 * Team Feed server actions. Follows the reference pattern in
 * app/(app)/people/actions.ts: every action calls requirePermission()
 * before touching the DB, mutations go through the per-request client so
 * Postgres RLS (supabase/migrations/20260707030000_tokens_rewards_feed_rls.sql)
 * independently re-checks the same permission, and every action returns a
 * discriminated ActionResult instead of throwing.
 *
 * Idempotency note: toggleLike is a true toggle (insert if absent, delete if
 * present), so calling it twice in a row just flips the like back off --
 * there's no "double submit" failure mode to guard against.
 */

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { awardTokens, DuplicateTokenAwardError } from "@/lib/tokens/ledger";
import { emitEvent } from "@/lib/events/bus";
import type { ActionResult } from "@/app/(app)/team/action-types";
import {
  addCommentSchema,
  createBroadcastSchema,
  createRecognitionSchema,
  postIdSchema,
  type AddCommentInput,
  type CreateBroadcastInput,
  type CreateRecognitionInput,
  type PostIdInput,
} from "@/app/(app)/team/validation";

/**
 * emitEvent() is best-effort here: the token/feed_posts mutation above it
 * already committed, so a failure to record the event must not surface as
 * an action failure. Same "emitEventSafely" precedent as
 * app/api/cron/checklists/route.ts (S1).
 */
async function emitEventSafely(key: Parameters<typeof emitEvent>[0], payload: Record<string, unknown>) {
  try {
    await emitEvent(key, payload);
  } catch (error) {
    console.error(`team actions: emitEvent(${key}) failed`, error);
  }
}

/**
 * Double-submit window for a recognition. Two identical recognitions (same
 * author, subject, body, amount) within this window collapse to a single
 * credit; the same recognition sent again after it is treated as a new,
 * intentional one. See recognitionIdempotencyKey.
 */
const RECOGNITION_DEDUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Deterministic idempotency key for a recognition credit, stored as the
 * award's `ref.event_id` so the `token_transactions_event_id_uq` index
 * (FIQ-03) makes the credit exactly-once at the database. Recognitions have no
 * natural event id (they aren't drained from app_events, they're written
 * directly), and the "send" button is out of this lane's owned files so a
 * client-supplied token can't be threaded in, so the key is derived from the
 * recognition's own content plus a coarse time bucket: a rapid double-submit
 * (double-click, retry, two tabs) lands in the same bucket and is deduped,
 * while a genuinely-repeated shoutout after the window gets a fresh bucket.
 */
function recognitionIdempotencyKey(
  authorId: string,
  subjectUserId: string,
  body: string,
  amount: number,
  now: number
): string {
  const bucket = Math.floor(now / RECOGNITION_DEDUP_WINDOW_MS);
  return createHash("sha256")
    .update(`recognition:${authorId}:${subjectUserId}:${amount}:${bucket}:${body}`)
    .digest("hex");
}

/**
 * Sends a Recognition: tokens + a public shoutout (ARCHITECTURE.md "Tokens &
 * Rewards": "Leaders send Recognitions: tokens + a public shoutout in the
 * Team Feed"). tokens.award-gated -- the same permission the ledger insert
 * and the feed_posts insert policy both require.
 *
 * Double-submit safe (FIQ finding: createRecognition is not double-submit
 * safe): the token credit carries a deterministic ref.event_id, so the FIQ-03
 * unique index guarantees the credit happens at most once per
 * (author, subject, body, amount, time-bucket). A duplicate submit that the
 * index rejects falls through to "ensure exactly one feed post exists" rather
 * than crediting again, which ALSO recovers the old phantom-credit hole (a
 * credit that succeeded but whose feed post insert failed): the retry finds no
 * post and creates it. The credit is the money-critical side and is
 * DB-atomic; a duplicate feed post under true concurrency is at worst
 * cosmetic. A fully-atomic credit+post would need one SECURITY DEFINER SQL
 * function, which is out of this code-only lane (schema is frozen).
 */
export async function createRecognition(
  input: CreateRecognitionInput
): Promise<ActionResult<{ postId: string }>> {
  try {
    await requirePermission("tokens.award");

    const parsed = createRecognitionSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Not signed in." };
    }

    if (parsed.subjectUserId === user.id) {
      return { ok: false, error: "You can't recognize yourself." };
    }

    const eventId = recognitionIdempotencyKey(
      user.id,
      parsed.subjectUserId,
      parsed.body,
      parsed.amount,
      Date.now()
    );

    // FEED-RECOGNITION: award via the service-role client, not the per-request
    // one. awardTokens does `.insert(...).select("id").single()`, and the
    // RETURNING read is re-checked by the token_transactions SELECT policy. A
    // non-manager award-holder (Team Leader / Shift Supervisor) can insert a
    // credit but can't SELECT a row that credits SOMEONE ELSE, so the
    // per-request client's read-back failed and Postgres rolled the whole
    // award back -- the recognition silently produced no feed post. The
    // requirePermission("tokens.award") gate above already authorizes the
    // credit; the service-role path is exactly how the event consumer calls
    // awardTokens (see lib/tokens/ledger.ts). Same class as the fixed ACC1
    // infraction-insert bug. Only the ledger write bypasses RLS; the feed_posts
    // insert below stays on the per-request client (its RLS policy already
    // permits a tokens.award holder).
    const admin = createServiceRoleClient();

    let alreadyCredited = false;
    try {
      await awardTokens(
        {
          userId: parsed.subjectUserId,
          amount: parsed.amount,
          kind: "recognition",
          ref: { from_user_id: user.id, event_id: eventId },
          note: parsed.body,
          createdBy: user.id,
        },
        admin
      );
    } catch (awardError) {
      // A prior identical submit already credited this recognition. Don't
      // credit again; fall through to make sure its feed post exists.
      if (!(awardError instanceof DuplicateTokenAwardError)) throw awardError;
      alreadyCredited = true;
    }

    if (alreadyCredited) {
      const { data: existing } = await supabase
        .from("feed_posts")
        .select("id")
        .eq("kind", "recognition")
        .eq("author_id", user.id)
        .eq("subject_user_id", parsed.subjectUserId)
        .eq("body", parsed.body)
        .eq("tokens_awarded", parsed.amount)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        return { ok: true, data: { postId: existing.id } };
      }
      // Credited on a prior submit but the post never landed: fall through and
      // create it now (recovery), rather than leaving a credit with no post.
    }

    const { data: post, error } = await supabase
      .from("feed_posts")
      .insert({
        kind: "recognition",
        author_id: user.id,
        subject_user_id: parsed.subjectUserId,
        body: parsed.body,
        tokens_awarded: parsed.amount,
      })
      .select("id")
      .single();

    if (error || !post) {
      return { ok: false, error: error?.message ?? "Could not post the recognition." };
    }

    await emitEventSafely("recognition", {
      post_id: post.id,
      actor_id: user.id,
      user_id: parsed.subjectUserId,
      amount: parsed.amount,
      body: parsed.body,
    });

    revalidatePath("/team");
    revalidatePath("/team/feed");
    revalidatePath("/tokens");
    return { ok: true, data: { postId: post.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Posts a leader Broadcast (announcement) to the feed
 * (ARCHITECTURE.md "Team Feed": "leader Broadcasts (announcements: rollouts,
 * events, policy updates)"). feed.post_broadcast only.
 */
export async function createBroadcast(
  input: CreateBroadcastInput
): Promise<ActionResult<{ postId: string }>> {
  try {
    await requirePermission("feed.post_broadcast");

    const parsed = createBroadcastSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: post, error } = await supabase
      .from("feed_posts")
      .insert({ kind: "broadcast", author_id: user?.id ?? null, body: parsed.body })
      .select("id")
      .single();

    if (error || !post) {
      return { ok: false, error: error?.message ?? "Could not post the broadcast." };
    }

    await emitEventSafely("broadcast", { post_id: post.id, author_id: user?.id ?? null, body: parsed.body });

    revalidatePath("/team");
    revalidatePath("/team/feed");
    return { ok: true, data: { postId: post.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Toggles the caller's like on a post (ARCHITECTURE.md "Team Feed": "Team
 * members can like and comment on posts"). feed.post is a base permission
 * granted to every seeded role.
 */
export async function toggleLike(input: PostIdInput): Promise<ActionResult<{ liked: boolean }>> {
  try {
    await requirePermission("feed.post");

    const parsed = postIdSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Not signed in." };
    }

    const { data: existing } = await supabase
      .from("feed_likes")
      .select("post_id")
      .eq("post_id", parsed.postId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("feed_likes")
        .delete()
        .eq("post_id", parsed.postId)
        .eq("user_id", user.id);
      if (error) return { ok: false, error: error.message };
      revalidatePath("/team");
      revalidatePath("/team/feed");
      return { ok: true, data: { liked: false } };
    }

    const { error } = await supabase
      .from("feed_likes")
      .insert({ post_id: parsed.postId, user_id: user.id });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/team");
    revalidatePath("/team/feed");
    return { ok: true, data: { liked: true } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Adds a comment to a post. feed.post is a base permission granted to every seeded role. */
export async function addComment(input: AddCommentInput): Promise<ActionResult> {
  try {
    await requirePermission("feed.post");

    const parsed = addCommentSchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("feed_comments")
      .insert({ post_id: parsed.postId, author_id: user?.id ?? null, body: parsed.body });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/team");
    revalidatePath("/team/feed");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
