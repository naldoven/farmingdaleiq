import { describe, expect, it } from "vitest";

import {
  rankCandidatesForPosition,
  stubPositionRatingLookup,
  type PositionRatingLookup,
} from "./auto-place";

describe("stubPositionRatingLookup", () => {
  it("always returns null (P2 wiring point)", async () => {
    await expect(
      stubPositionRatingLookup.getPositionRating("user-1", "pos-1"),
    ).resolves.toBeNull();
  });
});

describe("rankCandidatesForPosition", () => {
  it("falls back to input order when every rating is null", async () => {
    const result = await rankCandidatesForPosition(["a", "b", "c"], "pos-1");
    expect(result.map((c) => c.userId)).toEqual(["a", "b", "c"]);
  });

  it("sorts rated candidates above unrated ones, highest rating first", async () => {
    const ratings: Record<string, number | null> = { a: null, b: 3, c: 5 };
    const lookup: PositionRatingLookup = {
      async getPositionRating(userId) {
        return ratings[userId] ?? null;
      },
    };

    const result = await rankCandidatesForPosition(["a", "b", "c"], "pos-1", lookup);
    expect(result.map((c) => c.userId)).toEqual(["c", "b", "a"]);
  });

  it("keeps stable relative order for equal ratings", async () => {
    const ratings: Record<string, number | null> = { a: 4, b: 4 };
    const lookup: PositionRatingLookup = {
      async getPositionRating(userId) {
        return ratings[userId] ?? null;
      },
    };

    const result = await rankCandidatesForPosition(["a", "b"], "pos-1", lookup);
    expect(result.map((c) => c.userId)).toEqual(["a", "b"]);
  });
});
