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
