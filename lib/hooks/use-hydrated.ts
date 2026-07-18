import { useSyncExternalStore } from "react";

/** Client-only fact that never changes after mount, so the store never notifies. */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Returns false during SSR and on the first client render (so it always matches
 * the server output), then true after hydration commits.
 *
 * This is the hydration-safe way to gate browser-only UI: it avoids reading
 * client-only facts (UA string, `Notification.permission`, localStorage) during
 * the first render — which causes React #418 mismatches — without a
 * setState-in-effect, which this repo's React Compiler lint rule forbids.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
