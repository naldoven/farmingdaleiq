"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AppHeader } from "@/components/mobile/app-header";
import { BottomTabBar } from "@/components/mobile/bottom-tab-bar";
import { Sidebar } from "@/components/mobile/sidebar";
import { useSmartBack } from "@/components/mobile/use-smart-back";
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
   * Permission keys the signed-in user holds, computed server-side and passed
   * to the sidebar's NavLinks so gated items the user can't reach are hidden
   * (S4 dead-end fix). Omit to show every nav item.
   */
  navPermissions?: readonly string[];
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
 * page. Desktops get the restyled left sidebar plus the same sub-page back
 * affordance above content. Page content renders in the scrollable main slot
 * with padding that clears the fixed bottom bar.
 */
export function AppShell({
  user,
  children,
  storeName = "Farmingdale",
  storeAddress = "1991 Broadhollow Rd",
  hasUnread = false,
  navPermissions,
  layout = "responsive",
}: AppShellProps) {
  const pathname = usePathname() ?? "/";
  const header = resolveHeader(pathname);
  const { canGoBack, goBack } = useSmartBack();

  const showSidebar = layout === "responsive" || layout === "desktop";
  const showMobile = layout === "responsive" || layout === "mobile";
  const backPillClassName =
    "inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-semibold text-muted-ink shadow-card transition-colors hover:bg-secondary hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

  return (
    <div className="flex min-h-svh bg-canvas">
      {showSidebar && (
        <Sidebar
          user={{ name: user.name, roleName: user.roleName }}
          allowedPermissions={navPermissions}
        />
      )}

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
          {showSidebar && header.showBack && (
            <div className="mb-4 hidden md:flex">
              {canGoBack ? (
                <button type="button" onClick={goBack} aria-label="Back" className={backPillClassName}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </button>
              ) : (
                <Link href={header.backHref} aria-label="Back" className={backPillClassName}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Back
                </Link>
              )}
            </div>
          )}
          {children}
        </main>

        {showMobile && <BottomTabBar pathname={pathname} />}
      </div>
    </div>
  );
}
