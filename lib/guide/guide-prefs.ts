"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this browser has dismissed the first-shift guide card on Home.
 *
 * Same shape as `lib/nav/nav-prefs.ts`: localStorage behind
 * `useSyncExternalStore`, with the server snapshot fixed at "not dismissed".
 * Reading storage in the first client render would not match the server HTML
 * (React #418), and a setState-in-effect trips this repo's React Compiler lint
 * rule. The cost is that a person who already dismissed it may see the card for
 * one frame after hydration, which is better than a hydration error.
 *
 * Per browser on purpose: there is no server mutation in this feature. Someone
 * who opens the app on a second phone sees the card once there, then hides it.
 */

const STORAGE_KEY = "fiq.guide.dismissed.v1";
const DISMISSED_VALUE = "1";

let cache = false;
let loaded = false;
const listeners = new Set<() => void>();

/** Only the exact value we write counts, so stray or hand-edited data shows the card. */
export function parseDismissed(raw: string | null): boolean {
  return raw === DISMISSED_VALUE;
}

function readStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return parseDismissed(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage blocked (private mode, policy): treat as not dismissed.
    return false;
  }
}

/**
 * Memoized so repeat calls return a stable value; `useSyncExternalStore` needs
 * that to avoid re-render loops.
 */
function getSnapshot(): boolean {
  if (!loaded) {
    cache = readStorage();
    loaded = true;
  }
  return cache;
}

function getServerSnapshot(): boolean {
  return false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab dismissed (or cleared) it: drop the cache so the next read is fresh.
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

/** Hide the guide card from Home for good on this browser. */
export function dismissGuide(): void {
  cache = true;
  loaded = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, DISMISSED_VALUE);
  } catch {
    // Storage unavailable: the in-memory flag still hides the card for this
    // session; only persistence across reloads is lost.
  }
  for (const notify of listeners) notify();
}

export function useGuideDismissed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Test hook: clears the module cache so each test starts from storage. */
export function resetGuidePrefsCacheForTests(): void {
  cache = false;
  loaded = false;
}
