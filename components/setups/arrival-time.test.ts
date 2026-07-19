// Pin a real DST-observing zone so the round-trip is exercised across the
// summer (EDT, -04:00) / winter (EST, -05:00) boundary, mirroring the store's
// Long Island time zone. Set before importing the helpers / touching Date.
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";

import { isoToLocalInput, localInputToIso } from "./arrival-time";

describe("arrival-time isoToLocalInput / localInputToIso (SETB1)", () => {
  it("returns '' for empty / null / invalid input", () => {
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput(undefined)).toBe("");
    expect(isoToLocalInput("")).toBe("");
    expect(isoToLocalInput("not-a-date")).toBe("");
  });

  it("shows a summer (EDT, -04:00) UTC timestamp in local wall clock", () => {
    // 13:30 UTC in July is 09:30 local (EDT).
    expect(isoToLocalInput("2026-07-18T13:30:00.000Z")).toBe("2026-07-18T09:30");
  });

  it("shows a winter (EST, -05:00) UTC timestamp in local wall clock", () => {
    // 13:30 UTC in January is 08:30 local (EST).
    expect(isoToLocalInput("2026-01-18T13:30:00.000Z")).toBe("2026-01-18T08:30");
  });

  it("round-trips UTC -> local input -> UTC unchanged (both directions, incl. DST)", () => {
    // Summer, winter, and a value straddling the spring-forward day.
    for (const iso of [
      "2026-07-18T13:30:00.000Z",
      "2026-01-18T13:30:00.000Z",
      "2026-03-09T12:00:00.000Z",
      "2026-11-02T06:15:00.000Z",
    ]) {
      expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
    }
  });

  it("what a leader types is what reloads (local -> UTC -> local unchanged)", () => {
    for (const local of ["2026-07-18T09:30", "2026-01-18T08:30", "2026-12-24T23:45"]) {
      expect(isoToLocalInput(localInputToIso(local))).toBe(local);
    }
  });
});
