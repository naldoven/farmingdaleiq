import { describe, expect, it } from "vitest";

import { computeSuitability, MIN_QUALIFIED_STARS } from "./position-ratings";

describe("computeSuitability", () => {
  it("flags an unrated candidate as under three stars", () => {
    const s = computeSuitability({ rating: null, hasPassportProgram: false, stamped: false });
    expect(s.rating).toBeNull();
    expect(s.underThreeStars).toBe(true);
    expect(s.passportStamped).toBeNull();
    expect(s.unstampedPassport).toBe(false);
  });

  it("flags a below-threshold rating", () => {
    const s = computeSuitability({ rating: MIN_QUALIFIED_STARS - 1, hasPassportProgram: false, stamped: false });
    expect(s.underThreeStars).toBe(true);
  });

  it("does not flag a candidate at or above the threshold", () => {
    const s = computeSuitability({ rating: MIN_QUALIFIED_STARS, hasPassportProgram: false, stamped: false });
    expect(s.underThreeStars).toBe(false);
  });

  it("reports an unstamped passport only when a program exists and is not stamped", () => {
    const noProgram = computeSuitability({ rating: 5, hasPassportProgram: false, stamped: false });
    expect(noProgram.passportStamped).toBeNull();
    expect(noProgram.unstampedPassport).toBe(false);

    const unstamped = computeSuitability({ rating: 5, hasPassportProgram: true, stamped: false });
    expect(unstamped.passportStamped).toBe(false);
    expect(unstamped.unstampedPassport).toBe(true);

    const stamped = computeSuitability({ rating: 5, hasPassportProgram: true, stamped: true });
    expect(stamped.passportStamped).toBe(true);
    expect(stamped.unstampedPassport).toBe(false);
  });
});
