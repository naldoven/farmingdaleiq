"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NavLinks } from "@/components/shell/nav-links";
import { SignOutButton } from "@/components/shell/sign-out-button";

export interface CurrentUser {
  name: string;
  email: string;
  roleName: string | null;
}

export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            F
          </span>
          <span className="font-semibold">FarmingdaleIQ</span>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks />
        </div>
        <UserFooter user={user} initials={initials} />
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            F
          </span>
          <span className="font-semibold">FarmingdaleIQ</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle menu"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="w-72 max-w-[85vw] overflow-y-auto bg-card p-3 shadow-lg">
            <NavLinks onNavigate={() => setMobileOpen(false)} />
            <div className="mt-4">
              <UserFooter user={user} initials={initials} />
            </div>
          </div>
          <button
            aria-label="Close menu"
            className="flex-1 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
    </div>
  );
}

function UserFooter({
  user,
  initials,
}: {
  user: CurrentUser;
  initials: string;
}) {
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2">
        <Avatar className="h-9 w-9">
          <AvatarFallback>{initials || "?"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {user.roleName ?? "No role"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Link
          href="/notifications"
          className="flex-1 rounded-md border border-input px-2 py-1.5 text-center text-xs font-medium hover:bg-accent"
        >
          Notifications
        </Link>
        <SignOutButton />
      </div>
    </div>
  );
}
