"use server";

/**
 * Notification-center server actions. Follows the guard pattern documented
 * in app/(app)/people/actions.ts: requirePermission() first, per-request
 * Supabase client for the actual write (so RLS re-checks it), discriminated
 * ActionResult return, revalidatePath after a mutation.
 *
 * Ownership check: `notifications.view` just proves you're signed in with a
 * role that can see the notification center at all — it does not, by
 * itself, prove `id` belongs to you. Every mutation here additionally
 * scopes the write to `user_id = <current user>`, and the RLS policy on
 * `notifications` (supabase/migrations/20260707002100_notifications_discord_rls.sql)
 * independently enforces the same restriction (`user_id = auth.uid()`),
 * matching the "requirePermission is the friendly failure, RLS is the real
 * backstop" split from the People pattern.
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import { savePushSubscription } from "@/lib/notify/push";
import type { ActionResult } from "@/app/(app)/notifications/action-types";
import {
  markNotificationReadSchema,
  savePushSubscriptionSchema,
  type MarkNotificationReadInput,
  type SavePushSubscriptionInput,
} from "@/app/(app)/notifications/validation";

export async function markRead(input: MarkNotificationReadInput): Promise<ActionResult> {
  try {
    await requirePermission("notifications.view");
    const parsed = markNotificationReadSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "Not signed in." };
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", parsed.id)
      .eq("user_id", user.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/notifications");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function markAllRead(): Promise<ActionResult> {
  try {
    await requirePermission("notifications.view");
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "Not signed in." };
    }

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/notifications");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Saves a browser's Web Push subscription for the signed-in user (PWA
 * notification opt-in flow, components/notifications/push-opt-in.tsx).
 */
export async function saveMyPushSubscription(
  input: SavePushSubscriptionInput,
): Promise<ActionResult> {
  try {
    await requirePermission("notifications.view");
    const parsed = savePushSubscriptionSchema.parse(input);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { ok: false, error: "Not signed in." };
    }

    await savePushSubscription(user.id, parsed);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
