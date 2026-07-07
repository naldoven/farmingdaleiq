/**
 * Web Push sender skeleton (VAPID). Full implementation (key generation,
 * `web-push` library wiring, retry/backoff) is out of scope for P0 — this
 * defines the contract other modules can build against.
 *
 * Required env vars (not yet set): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT (mailto: contact).
 */

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

/**
 * Sends a Web Push message to one subscription. Throws if the VAPID env vars
 * are missing so callers notice misconfiguration in development rather than
 * silently dropping notifications.
 */
export async function sendWebPush(
  _subscription: PushSubscriptionRecord,
  _payload: WebPushPayload,
): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    throw new Error(
      "sendWebPush: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not configured yet",
    );
  }

  // TODO: implement with the `web-push` package once VAPID keys exist.
  // await webpush.sendNotification(subscription, JSON.stringify(payload));
}

/** Saves a browser's push subscription (from the PWA install/notification-permission flow) to `push_subscriptions`. */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionRecord,
) {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

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
