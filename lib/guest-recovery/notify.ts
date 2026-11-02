import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Tells the person who owns a Spotlight recovery that a reward is waiting.
 * Written with the service-role client: the events policy refuses this key from
 * any signed-in user, so nobody can push text to the overseer. The notice names
 * no guest, phone, email or item: only that someone is waiting, and it links to
 * the list, where the permission-gated screen shows the detail. Best effort:
 * the recovery is already saved, so a failed notice never fails the log. Returns
 * whether the notice was written, so a leader is never told someone was notified
 * when they were not.
 */
export const SPOTLIGHT_NOTICE = {
  title: "A Spotlight reward is waiting",
  message: "A guest with the Chick-fil-A app is waiting on a reward. Open Guest Recovery to send it.",
} as const;

export async function notifySpotlightAssignee(assigneeId: string): Promise<boolean> {
  try {
    const client = createServiceRoleClient();
    const { error } = await client.from("app_events").insert({
      event_key: "guest_recovery_spotlight",
      payload: {
        user_id: assigneeId,
        title: SPOTLIGHT_NOTICE.title,
        message: SPOTLIGHT_NOTICE.message,
        link: "/guest-recovery",
      },
    });
    return !error;
  } catch {
    // See above: best effort. The caller says so when the notice did not go.
    return false;
  }
}
