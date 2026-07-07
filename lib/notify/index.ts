import { createClient } from "@/lib/supabase/server";
import type { EventKey } from "@/lib/events/bus";

export interface CreateNotificationInput {
  userId: string;
  kind: EventKey | (string & {});
  title: string;
  body?: string;
  link?: string;
}

/** Inserts a row into `notifications` for the in-app notification center (bell + unread badge). */
export async function createNotification(input: CreateNotificationInput) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`createNotification failed: ${error.message}`);
  }

  return data;
}

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);

  if (error) {
    throw new Error(`markNotificationRead failed: ${error.message}`);
  }
}

/** Marks every unread notification belonging to `userId` as read. */
export async function markAllNotificationsRead(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    throw new Error(`markAllNotificationsRead failed: ${error.message}`);
  }
}

/** Count of unread notifications for the bell badge. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) {
    throw new Error(`countUnreadNotifications failed: ${error.message}`);
  }

  return count ?? 0;
}
