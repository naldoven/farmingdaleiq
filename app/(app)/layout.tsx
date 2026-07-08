import { redirect } from "next/navigation";

import { AppShell } from "@/components/mobile/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email, role_id")
    .eq("id", user.id)
    .maybeSingle();

  let roleName: string | null = null;
  if (profile?.role_id) {
    const { data: role } = await supabase
      .from("roles")
      .select("name")
      .eq("id", profile.role_id)
      .maybeSingle();
    roleName = role?.name ?? null;
  }

  const currentUser = {
    name: profile?.name ?? user.email ?? "Unknown",
    email: profile?.email ?? user.email ?? "",
    roleName,
  };

  // Header bell unread dot (components/mobile/notification-bell.tsx). Same
  // `notifications` table + RLS (user_id = auth.uid()) the notification
  // center itself reads (app/(app)/notifications/page.tsx); a `head: true`
  // count avoids fetching rows just to know whether any are unread.
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return (
    <AppShell user={currentUser} hasUnread={Boolean(unreadCount)}>
      {children}
    </AppShell>
  );
}
