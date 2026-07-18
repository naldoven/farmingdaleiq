import { describe, expect, it, vi } from "vitest";

// The component imports the server action and next/navigation; stub both so we
// can import the pure helper without pulling in server-only code.
vi.mock("@/app/(app)/settings/discord/actions", () => ({
  setEventRoute: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { effectiveEnabled } from "./event-route-table";

/**
 * F-SET-2 client footgun: an unlinked route (channel_id === null) must read as
 * disabled no matter what `enabled` the DB stored, so assigning it a new
 * channel can't silently carry a stale enabled=true.
 */
describe("effectiveEnabled", () => {
  it("is false when the route has no channel, even if stored enabled is true", () => {
    expect(effectiveEnabled("", true)).toBe(false);
  });

  it("is false when there is no channel and stored enabled is false", () => {
    expect(effectiveEnabled("", false)).toBe(false);
  });

  it("preserves the stored enabled once a channel is assigned", () => {
    expect(effectiveEnabled("channel-123", true)).toBe(true);
    expect(effectiveEnabled("channel-123", false)).toBe(false);
  });
});
