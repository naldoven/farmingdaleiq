import { describe, expect, it } from "vitest";

import { buildVacantSlotRows } from "./logic";

const tierId = "11111111-1111-4111-8111-111111111111";

describe("buildVacantSlotRows", () => {
  it("builds one row per goal_count, sorted from 0", () => {
    expect(buildVacantSlotRows(tierId, 3)).toEqual([
      { tier_id: tierId, sort: 0 },
      { tier_id: tierId, sort: 1 },
      { tier_id: tierId, sort: 2 },
    ]);
  });

  it("returns an empty array for a zero goal count", () => {
    expect(buildVacantSlotRows(tierId, 0)).toEqual([]);
  });

  it("returns an empty array for a negative goal count", () => {
    expect(buildVacantSlotRows(tierId, -1)).toEqual([]);
  });
});
