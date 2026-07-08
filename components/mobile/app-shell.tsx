"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { AppHeader, Wordmark } from "@/components/mobile/app-header";
import { AvatarInitials } from "@/components/mobile/avatar-initials";
import { BottomTabBar } from "@/components/mobile/bottom-tab-bar";
import { Sidebar } from "@/components/mobile/sidebar";
import { NavLinks } from "@/components/shell/nav-links";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { resolveHeader } from "@/lib/nav/page-map";
import { cn } from "@/lib/utils";

export interface CurrentUser {
  name: string;
  email: string;
  roleName: string | null;
}

export interface AppShellProps {
  user: CurrentUser;
  children: React.ReactNode;
  /** Store shown in the home-header pill. */
  storeName?: string;
  storeAddress?: string;
  hasUnread?: boolean;
  /**
   * Layout override. "responsive" (default) shows the sidebar at md+ and the
   * mobile chrome below md via CSS. "mobile" / "desktop" force one and are used
   * by tests to assert the correct nav per breakpoint.
   */
  layout?: "responsive" | "mobile" | "desktop";
}

/**
 * Responsive application shell. Phones get a sticky mobile header, a fixed
 * bottom tab bar (Home / Team / Menu), and a full-nav drawer behind the Menu
 * tab. Desktops get the restyled left sidebar. Page content renders in the
 * scrollable main slot with padding that clears the fixed bottom bar.
 */
export function AppShell({
  user,
  children,
  storeName = "Farmingdale",
  storeAddress = "1991 Broadhollow Rd",
  hasUnread = false,
  layout = "responsive",
}: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = React.useState(false);
  const header = resolveHeader(pathname);

  const showSidebar = layout === "responsive" || layout === "desktop";
  const showMobile = layout === "responsive" || layout === "mobile";

  // Close the drawer whenever the route changes. Adjusting state during render
  // (React's endorsed pattern) instead of an effect avoids a cascading render.
  const [drawerRoute, setDrawerRoute] = React.useState(pathname);
  if (drawerRoute !== pathname) {
    setDrawerRoute(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="flex min-h-svh bg-canvas">
      {showSidebar && <Sidebar user={{ name: user.name, roleName: user.roleName }} />}

      <div className="flex min-w-0 flex-1 flex-col">
        {showMobile && (
          <AppHeader
            variant={header.variant}
            title={header.title}
            backHref={header.backHref}
            userName={user.name}
            storeName={storeName}
            storeAddress={storeAddress}
            hasUnread={hasUnread}
          />
        )}

        <main
          className={cn(
            "flex-1 p-4 md:p-8",
            showMobile && "pb-24 md:pb-8",
          )}
        >
          {children}
        </main>

        {showMobile && (
          <BottomTabBar
            pathname={pathname}
            menuOpen={menuOpen}
            onMenuClick={() => setMenuOpen((v) => !v)}
          />
        )}
      </div>

      {showMobile && menuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative mt-auto flex max-h-[85vh] flex-col rounded-t-2xl bg-card pb-safe shadow-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Wordmark />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-secondary"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </div>
            <div className="flex items-center gap-3 border-t border-line p-4">
              <AvatarInitials name={user.name || "?"} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                <p className="truncate text-xs text-muted-ink">
                  {user.roleName ?? "No role"}
                </p>
              </div>
              <SignOutButton />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
