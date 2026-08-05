"use client";

import { useSyncExternalStore } from "react";

/**
 * Persisted navigation preferences: whether the desktop sidebar is shrunk to
 * the icon rail, and which nav groups the user has explicitly opened or closed.
 *
 * Backed by localStorage through `useSyncExternalStore` rather than
 * `useState` + `useEffect`. Reading localStorage during the first client render
 * would not match the server output (React #418); a setState-in-effect would
 * trip this repo's React Compiler lint rule. `getServerSnapshot` returns the
 * defaults for SSR *and* for hydration, then React re-renders with the stored
 * value once hydration commits — the same approach as `useHydrated()`.
 *
 * Open/closed is stored as two explicit sets rather than one "open" list so the
 * group you are currently in can auto-open (see `isNavGroupOpen`) while still
 * being closable by hand — a single list cannot express "open by default, but
 * the user shut it".
 */

const STORAGE_KEY = "fiq.nav.prefs.v1";

export interface NavPrefs {
  /** Desktop sidebar is shrunk to the icon-only rail. */
  collapsed: boolean;
  /** Group labels the user explicitly opened. */
  openGroups: readonly string[];
  /** Group labels the user explicitly closed, including the active one. */
  closedGroups: readonly string[];
}

export const DEFAULT_NAV_PREFS: NavPrefs = {
  collapsed: false,
  openGroups: [],
  closedGroups: [],
};

let cache: NavPrefs = DEFAULT_NAV_PREFS;
let loaded = false;
const listeners = new Set<() => void>();

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parsePrefs(raw: string | null): NavPrefs {
  if (!raw) return DEFAULT_NAV_PREFS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_NAV_PREFS;
    const record = parsed as Record<string, unknown>;
    return {
      collapsed: record.collapsed === true,
      openGroups: stringList(record.openGroups),
      closedGroups: stringList(record.closedGroups),
    };
  } catch {
    // Corrupt or unreadable value (private mode, quota, hand-edited): fall back
    // to defaults rather than breaking the whole nav.
    return DEFAULT_NAV_PREFS;
  }
}

function readStorage(): NavPrefs {
  if (typeof window === "undefined") return DEFAULT_NAV_PREFS;
  try {
    return parsePrefs(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_NAV_PREFS;
  }
}

/**
 * Memoized so repeat calls return a referentially stable value — returning a
 * fresh object each time would make `useSyncExternalStore` loop forever.
 */
function getSnapshot(): NavPrefs {
  if (!loaded) {
    cache = readStorage();
    loaded = true;
  }
  return cache;
}

function getServerSnapshot(): NavPrefs {
  return DEFAULT_NAV_PREFS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed the prefs: drop the cache so the next snapshot re-reads.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    loaded = false;
    for (const notify of listeners) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(next: NavPrefs): void {
  cache = next;
  loaded = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (Safari private mode, quota). The in-memory cache
    // still drives this session; only persistence across reloads is lost.
  }
  for (const notify of listeners) notify();
}

function without(list: readonly string[], label: string): string[] {
  return list.filter((entry) => entry !== label);
}

function withLabel(list: readonly string[], label: string): string[] {
  return list.includes(label) ? [...list] : [...list, label];
}

/** Shrink the sidebar to the icon rail, or restore it to full width. */
export function setNavCollapsed(collapsed: boolean): void {
  write({ ...getSnapshot(), collapsed });
}

/** Record a group as explicitly open or explicitly closed. */
export function setNavGroupOpen(label: string, open: boolean): void {
  const prefs = getSnapshot();
  write({
    ...prefs,
    openGroups: open
      ? withLabel(prefs.openGroups, label)
      : without(prefs.openGroups, label),
    closedGroups: open
      ? without(prefs.closedGroups, label)
      : withLabel(prefs.closedGroups, label),
  });
}

/**
 * Expand the rail and open one group in a single write — what clicking a
 * multi-page section's icon in the collapsed rail does, so the user lands with
 * that section's pages already showing instead of having to click twice.
 */
export function expandNavToGroup(label: string): void {
  const prefs = getSnapshot();
  write({
    collapsed: false,
    openGroups: withLabel(prefs.openGroups, label),
    closedGroups: without(prefs.closedGroups, label),
  });
}

/**
 * Whether a group renders expanded: an explicit close always wins, then an
 * explicit open, and otherwise the group holding the current route is open so
 * you can always see where you are.
 */
export function isNavGroupOpen(
  prefs: NavPrefs,
  label: string,
  activeGroupLabel: string | null,
): boolean {
  if (prefs.closedGroups.includes(label)) return false;
  if (prefs.openGroups.includes(label)) return true;
  return label === activeGroupLabel;
}

export function useNavPrefs(): NavPrefs {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test hook: clears the module cache so each test starts from storage. */
export function resetNavPrefsCacheForTests(): void {
  cache = DEFAULT_NAV_PREFS;
  loaded = false;
}
