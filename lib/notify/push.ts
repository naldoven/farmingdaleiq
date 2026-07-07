/**
 * Web Push sender (VAPID), built on the `web-push` package (S10: PLAN.md
 * "Build: event-bus consumer mapping event keys to in-app notifications +
 * web push"). P0 defined this file's contract as a skeleton; this fills it
 * in.
 *
 * Required env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * (mailto: contact), plus NEXT_PUBLIC_VAPID_PUBLIC_KEY (same public key,
 * exposed to the browser so the PWA can call `pushManager.subscribe`). Not
 * yet set in this environment — see this stream's final report for the
 * exact names to add once Naldo generates a VAPID key pair
 * (`npx web-push generate-vapid-keys`).
 */

import webpush from "web-push";

export interface PushSubscriptionRecord {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface WebPushPayload {
  title: string;
  body?: string;
  link?: string;
}

/** True when VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are set. */
function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidDetailsSet = false;
function ensureVapidDetails(): void {
  if (vapidDetailsSet) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidDetailsSet = true;
}

/** A push send failed because the subscription is gone (410) or invalid (404). */
export function isDeadSubscriptionError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

/**
 * Sends a Web Push message to one subscription. Throws if the VAPID env
 * vars are missing so callers notice misconfiguration in development
 * rather than silently dropping notifications; callers that fan out to
 * many subscriptions (lib/notify/events.ts) catch per-subscription so one
 * dead endpoint never blocks the rest of the batch.
 */
export async function sendWebPush(
  subscription: PushSubscriptionRecord,
  payload: WebPushPayload,
): Promise<void> {
  if (!vapidConfigured()) {
    throw new Error(
      "sendWebPush: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not configured yet",
    );
  }
  ensureVapidDetails();

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
  );
}

/** Minimal shape of the Supabase client this function needs; keeps it injectable for tests. */
interface PushSubscriptionStore {
  from(table: "push_subscriptions"): {
    delete(): { eq(col: string, value: string): Promise<{ error: { message: string } | null }> };
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

/**
 * Saves a browser's push subscription (from the PWA
 * install/notification-permission flow) to `push_subscriptions`.
 *
 * Idempotent by `endpoint`: a Web Push endpoint uniquely identifies one
 * browser/device, and the opt-in flow (components/notifications/push-opt-in.tsx)
 * can fire more than once — page reload, re-grant, a `pushsubscriptionchange`
 * re-register. `push_subscriptions` has no unique constraint on `endpoint`
 * (P0-owned table, S10 can't add one), so a plain insert would stack
 * duplicate rows for the same device and fan-out (lib/notify/events.ts) would
 * then send that device N copies of every push. So this first deletes any
 * existing row for this endpoint, then inserts a fresh one — which also
 * refreshes rotated p256dh/auth keys. The delete is RLS-scoped to the caller
 * (`user_id = auth.uid()`), so it only ever clears the current user's own
 * stale registration for this browser.
 */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionRecord,
  client?: PushSubscriptionStore,
) {
  let supabase: PushSubscriptionStore;
  if (client) {
    supabase = client;
  } else {
    const { createClient } = await import("@/lib/supabase/server");
    supabase = (await createClient()) as unknown as PushSubscriptionStore;
  }

  const { error: deleteError } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", subscription.endpoint);

  if (deleteError) {
    throw new Error(`savePushSubscription failed: ${deleteError.message}`);
  }

  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
  });

  if (error) {
    throw new Error(`savePushSubscription failed: ${error.message}`);
  }
}
