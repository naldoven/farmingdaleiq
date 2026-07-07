import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { NotificationList } from "@/components/notifications/notification-list";
import { PushOptIn } from "@/components/notifications/push-opt-in";

/**
 * /notifications — notification center (ARCHITECTURE.md page map:
 * "Notification center"; "Notifications" section: "in-app notification
 * center (bell + unread badge)"). Every seeded role holds
 * `notifications.view` (it's a personal-data view, not an admin one), so
 * this mirrors the RLS reality rather than actually restricting anyone.
 */
export default async function NotificationsPage() {
  await requirePermission("notifications.view");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: notifications } = user
    ? await supabase
        .from("notifications")
        .select("id, kind, title, body, link, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100)
    : { data: [] };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Notifications</h1>
      <PushOptIn />
      <NotificationList notifications={notifications ?? []} />
    </div>
  );
}
