import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadOrderDrivers } = vi.hoisted(() => ({ loadOrderDrivers: vi.fn() }));
vi.mock("@/app/(app)/catering/drivers/queries", () => ({ loadOrderDrivers }));

import { loadDriverBadges } from "./driver-badges";

const supabase = {} as SupabaseClient;

const delivery = (id: string, stage = "new") => ({ id, fulfillment: "delivery", stage });

beforeEach(() => {
  loadOrderDrivers.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("loadDriverBadges", () => {
  it("makes one query for every open delivery order and gives each an entry", async () => {
    loadOrderDrivers.mockResolvedValue(new Map([["a", [{ profileId: "p1", name: "Messiah Cole" }]]]));

    const result = await loadDriverBadges(supabase, [
      delivery("a"),
      delivery("b", "out"),
      { id: "c", fulfillment: "pickup", stage: "new" },
    ]);

    expect(loadOrderDrivers).toHaveBeenCalledTimes(1);
    expect(loadOrderDrivers).toHaveBeenCalledWith(supabase, ["a", "b"]);
    expect(result.get("a")).toEqual([{ profileId: "p1", name: "Messiah Cole" }]);
    expect(result.get("b")).toEqual([]);
    expect(result.has("c")).toBe(false);
  });

  it("skips orders that can no longer take a driver", async () => {
    const result = await loadDriverBadges(supabase, [
      delivery("done", "followup"),
      delivery("gone", "cancelled"),
      { id: "null", fulfillment: null, stage: "new" },
    ]);

    expect(loadOrderDrivers).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });

  it("returns no badges, not false 'Needs driver' ones, when the read fails", async () => {
    loadOrderDrivers.mockRejectedValue(new Error("boom"));

    const result = await loadDriverBadges(supabase, [delivery("a")]);

    expect(result.size).toBe(0);
  });
});
