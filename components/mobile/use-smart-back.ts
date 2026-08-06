"use client";

import { useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore } from "react";

const FIQ_HISTORY_DEPTH_KEY = "__fiqBackDepth";

type FiqHistoryState = Record<string, unknown> & {
  [FIQ_HISTORY_DEPTH_KEY]?: number;
};

const listeners = new Set<() => void>();
let historyPatched = false;

function isRecordState(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const prototype = Object.getPrototypeOf(data);
  return prototype === Object.prototype || prototype === null;
}

function historyDepth(state: unknown = window.history.state): number {
  if (!isRecordState(state)) return 0;
  const depth = (state as FiqHistoryState)[FIQ_HISTORY_DEPTH_KEY];
  return typeof depth === "number" && Number.isFinite(depth) && depth > 0
    ? depth
    : 0;
}

function stateWithDepth(data: unknown, depth: number): unknown {
  if (!isRecordState(data)) return data;
  if (depth <= 0 && !(FIQ_HISTORY_DEPTH_KEY in data)) return data;

  const nextState: FiqHistoryState = { ...data };
  if (depth > 0) {
    nextState[FIQ_HISTORY_DEPTH_KEY] = depth;
  } else {
    delete nextState[FIQ_HISTORY_DEPTH_KEY];
  }
  return nextState;
}

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

function ensureHistoryPatched(): void {
  if (historyPatched) return;
  historyPatched = true;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function pushState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    const nextDepth = historyDepth() + 1;
    originalPushState(stateWithDepth(data, nextDepth), unused, url);
    notifyListeners();
  };

  window.history.replaceState = function replaceState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalReplaceState(stateWithDepth(data, historyDepth()), unused, url);
    notifyListeners();
  };
}

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
 * Router API. The app installs a tiny history wrapper after hydration and adds
 * `__fiqBackDepth` to same-tab client-side entries while preserving Next.js's
 * own history state. A depth greater than 0 means at least one prior in-app
 * navigation happened this tab; no marker means this was a fresh entry page.
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
  ensureHistoryPatched();
  listeners.add(callback);
  window.addEventListener("popstate", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("popstate", callback);
  };
}

function getSnapshot(): boolean {
  return historyDepth() > 0;
}

/** No history on the server; matches the pre-hydration fallback-link state. */
function getServerSnapshot(): boolean {
  return false;
}

export function useSmartBack(): { canGoBack: boolean; goBack: () => void } {
  const router = useRouter();
  const canGoBack = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const goBack = useCallback(() => router.back(), [router]);
  return { canGoBack, goBack };
}
