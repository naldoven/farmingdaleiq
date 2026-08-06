import { redirect } from "next/navigation";

import { AppShell } from "@/components/mobile/app-shell";
import { hasPermission } from "@/lib/auth/permissions";
import { navPermissionKeys } from "@/lib/nav/page-map";
import { createClient } from "@/lib/supabase/server";
import { isEventFeatureEnabled } from "@/lib/features";

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

  // PPL2b: email moved to the locked profiles_private table. The shell only
  // needs the signed-in user's own email for the account footer, and the auth
  // session already carries it (user.email), so there is no need to read it
  // back from the database here.
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role_id")
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
    email: user.email ?? "",
    roleName,
  };

  // Header bell unread dot (components/mobile/notification-bell.tsx). Same
  // `notifications` table + RLS (user_id = auth.uid()) the notification
  // center itself reads (app/(app)/notifications/page.tsx); a `head: true`
  // Fetch only unread kinds, then exclude events owned by dormant features so
  // a hidden historical notification cannot leave an unexplained red dot.
  const { data: unreadNotifications } = await supabase
    .from("notifications")
    .select("kind")
    .eq("user_id", user.id)
    .is("read_at", null);
  const hasVisibleUnread = (unreadNotifications ?? []).some((notification) =>
    isEventFeatureEnabled(notification.kind),
  );

  // Nav gating (S4): resolve which permission-gated nav items this user can
  // actually reach, using the same has_permission() helper each destination
  // page's requirePermission() calls, so the sidebar never shows a dead-end
  // link that would throw on click. hasPermission fails closed on error.
  const navKeys = navPermissionKeys();
  const navGrants = await Promise.all(navKeys.map((key) => hasPermission(key)));
  const navPermissions = navKeys.filter((_, i) => navGrants[i]);

  return (
    <AppShell
      user={currentUser}
      hasUnread={hasVisibleUnread}
      navPermissions={navPermissions}
    >
      {children}
    </AppShell>
  );
}
