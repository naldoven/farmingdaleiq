import type { ReactNode } from "react";

import { Wordmark } from "@/components/mobile";

export interface AuthShellProps {
  /** Card heading (22px / bold, matches the sub-page title scale). */
  title: string;
  /** Optional one-line description under the title. */
  subtitle?: ReactNode;
  /** Form or confirmation content inside the card. */
  children: ReactNode;
  /** Optional content above the card (e.g. an inline auth-error banner). */
  banner?: ReactNode;
  /** Optional content below the card (e.g. a "Back to sign in" link). */
  footer?: ReactNode;
}

/**
 * Centered auth-page shell shared by /login, /forgot-password, and
 * /set-password: the FarmingdaleIQ wordmark over a single white rounded card
 * on the canvas background, matching the KitchenIQ mobile design system
 * (docs/DESIGN-SYSTEM.md). These screens render before the app shell mounts
 * (logged-out or mid-auth), so they lay out their own page frame instead of
 * going through AppShell/AppHeader.
 */
export function AuthShell({ title, subtitle, children, banner, footer }: AuthShellProps) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-canvas px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <Wordmark className="text-[28px]" />
        </div>

        {banner}

        <section className="overflow-hidden rounded-2xl border border-line bg-card p-6 shadow-card">
          <div className="mb-6 flex flex-col gap-1">
            <h1 className="text-[22px] font-bold text-ink">{title}</h1>
            {subtitle ? <p className="text-[15px] text-muted-ink">{subtitle}</p> : null}
          </div>
          {children}
        </section>

        {footer}
      </div>
    </main>
  );
}

/** Inline danger banner for auth errors (same tone as the design system's danger tint). */
export function AuthAlert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl bg-danger-soft px-4 py-3 text-[15px] font-medium text-danger"
    >
      {children}
    </p>
  );
}
