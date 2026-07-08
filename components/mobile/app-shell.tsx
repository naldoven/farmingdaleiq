"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { AppHeader } from "@/components/mobile/app-header";
import { BottomTabBar } from "@/components/mobile/bottom-tab-bar";
import { Sidebar } from "@/components/mobile/sidebar";
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
 * Responsive application shell. Phones get a sticky mobile header and a fixed
 * bottom tab bar (Home / Team / Tasks / Menu); the Menu tab opens the /menu hub
 * page. Desktops get the restyled left sidebar. Page content renders in the
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
  const header = resolveHeader(pathname);

  const showSidebar = layout === "responsive" || layout === "desktop";
  const showMobile = layout === "responsive" || layout === "mobile";

  return (
    <div className="flex min-h-svh bg-canvas">
      {showSidebar && <Sidebar user={{ name: user.name, roleName: user.roleName }} />}

      <div className="flex min-w-0 flex-1 flex-col">
        {showMobile && (
          <AppHeader
            variant={header.variant}
            title={header.title}
            backHref={header.backHref}
            showBack={header.showBack}
            userName={user.name}
            storeName={storeName}
            storeAddress={storeAddress}
            hasUnread={hasUnread}
          />
        )}

        <main className={cn("flex-1 p-4 md:p-8", showMobile && "pb-28 md:pb-8")}>
          {children}
        </main>

        {showMobile && <BottomTabBar pathname={pathname} />}
      </div>
    </div>
  );
}
