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

import { revalidatePath } from "next/cache";

import { PermissionError, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { awardTokens } from "@/lib/tokens/ledger";
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

function toActionError(error: unknown): string {
  if (error instanceof PermissionError) {
    return "You don't have permission to do this.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}

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
 * Sends a Recognition: tokens + a public shoutout (ARCHITECTURE.md "Tokens &
 * Rewards": "Leaders send Recognitions: tokens + a public shoutout in the
 * Team Feed"). tokens.award-gated -- the same permission the ledger insert
 * and the feed_posts insert policy both require.
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

    await awardTokens(
      {
        userId: parsed.subjectUserId,
        amount: parsed.amount,
        kind: "recognition",
        ref: { from_user_id: user.id },
        note: parsed.body,
        createdBy: user.id,
      },
      supabase
    );

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
      from_user_id: user.id,
      to_user_id: parsed.subjectUserId,
      amount: parsed.amount,
      body: parsed.body,
    });

    revalidatePath("/team");
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
      return { ok: true, data: { liked: false } };
    }

    const { error } = await supabase
      .from("feed_likes")
      .insert({ post_id: parsed.postId, user_id: user.id });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/team");
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
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
