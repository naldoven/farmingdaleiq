import { describe, expect, it } from "vitest";

import { allItemsComplete, canStampLeadership, canStampPosition, pickVacantSlot } from "./stamp-logic";

describe("allItemsComplete", () => {
  it("is false with zero items (nothing to stamp)", () => {
    expect(allItemsComplete([], [])).toBe(false);
  });

  it("is false when any item is missing progress", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const progress = [{ item_id: "a", completed_at: "2026-01-01T00:00:00Z" }];
    expect(allItemsComplete(items, progress)).toBe(false);
  });

  it("is true when every item has completed_at set", () => {
    const items = [{ id: "a" }, { id: "b" }];
    const progress = [
      { item_id: "a", completed_at: "2026-01-01T00:00:00Z" },
      { item_id: "b", completed_at: "2026-01-02T00:00:00Z" },
    ];
    expect(allItemsComplete(items, progress)).toBe(true);
  });

  it("ignores a progress row whose completed_at is still null", () => {
    const items = [{ id: "a" }];
    const progress = [{ item_id: "a", completed_at: null }];
    expect(allItemsComplete(items, progress)).toBe(false);
  });
});

describe("canStampPosition", () => {
  it("requires all items complete AND >= 3 stars", () => {
    expect(canStampPosition(true, 3)).toBe(true);
    expect(canStampPosition(true, 2.5)).toBe(false);
    expect(canStampPosition(false, 5)).toBe(false);
    expect(canStampPosition(true, null)).toBe(false);
  });
});

describe("canStampLeadership", () => {
  it("only requires all items complete", () => {
    expect(canStampLeadership(true)).toBe(true);
    expect(canStampLeadership(false)).toBe(false);
  });
});

describe("pickVacantSlot", () => {
  it("picks the lowest-sort vacant slot", () => {
    const slots = [
      { id: "1", user_id: "u1", sort: 1 },
      { id: "2", user_id: null, sort: 3 },
      { id: "3", user_id: null, sort: 2 },
    ];
    expect(pickVacantSlot(slots)?.id).toBe("3");
  });

  it("returns null when the tier is full", () => {
    const slots = [{ id: "1", user_id: "u1", sort: 1 }];
    expect(pickVacantSlot(slots)).toBeNull();
  });
});
