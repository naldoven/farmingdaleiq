"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

/**
 * Backs the app's "Back" controls (AppHeader's mobile chevron, AppShell's
 * desktop back pill) with real browser/app history instead of only a
 * computed parent-page href. Leader report (2026-08-06): the desktop back
 * button "doesn't go back to where I was" -- lib/nav/page-map.ts's
 * `backHref` is a STATIC guess (the URL's parent segment), not where the
 * user actually came from, and for some nested routes that guess isn't even
 * a real page (e.g. /catering/orders/[id]'s computed parent is
 * "/catering/orders", which has no index route -- only /catering/history,
 * /catering/dispatch etc. link INTO an order). `router.back()` returns to
 * wherever the user really navigated from, no matter which page that was.
 *
 * `fallbackHref` (the existing computed parent) is still used when there's
 * no in-app history to return to -- a bookmark, a notification link, or a
 * fresh tab -- so the control is never a dead end.
 *
 * Detecting "is there history to go back to" has no official Next.js App
 * Router API. `window.history.state?.idx` is the router's own internal
 * per-tab navigation counter (bumped on every client-side navigation it
 * performs) and is the standard workaround for exactly this need: idx > 0
 * means at least one prior in-app navigation happened this tab; idx 0 (or
 * no state at all, e.g. a hard page load) means this was the entry page.
 *
 * Read via useSyncExternalStore (React's dedicated API for a value that
 * lives outside React, e.g. a browser API) rather than useState+useEffect:
 * `history.state` isn't React state, and syncing an external value into
 * useState from inside an effect is exactly the "setState-in-effect"
 * pattern this project's stricter react-hooks lint rule flags, even though
 * it's a legitimate external-system-sync per React's own guidance.
 * useSyncExternalStore re-reads the snapshot on every render AND whenever
 * the subscription fires, so this stays correct across client-side
 * navigations (AppShell/AppHeader already re-render on every route change
 * via usePathname) and a real browser back/forward (the popstate listener).
 */

function subscribe(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getSnapshot(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === "number" && idx > 0;
}

/** No history on the server; matches the pre-hydration fallback-link state. */
function getServerSnapshot(): boolean {
  return false;
}

export function useSmartBack(): { canGoBack: boolean; goBack: () => void } {
  const router = useRouter();
  const canGoBack = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { canGoBack, goBack: () => router.back() };
}
