import { StatusBadge } from "@/components/mobile";
import type { StoreSetupAreaKey } from "@/lib/store-setup/areas";

/**
 * The small "Default, not confirmed" tag each editor shows beside the values
 * a manager has not yet checked (docs/STORE-SETUP.md). Renders nothing once
 * the area is confirmed on /settings/setup, so the tag disappears without
 * the editor page changing. Plain presentational component: the page reads
 * store_setup_areas (lib/store-setup/status.ts) and passes the set in.
 */
export function SetupDefaultTag({
  area,
  confirmed,
}: {
  area: StoreSetupAreaKey;
  confirmed: ReadonlySet<StoreSetupAreaKey>;
}) {
  if (confirmed.has(area)) return null;
  return <StatusBadge tone="warning">Default, not confirmed</StatusBadge>;
}
