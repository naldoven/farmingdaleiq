// Pin a real DST-observing zone so the round-trip is exercised across the
// summer (EDT, -04:00) / winter (EST, -05:00) boundary, mirroring the store's
// Long Island time zone. Set before importing the helpers / touching Date.
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";

import { isoToLocalInput, localInputToIso, scheduledEndToSave, timesForReassign } from "./arrival-time";

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

describe("timesForReassign", () => {
  const SAVED = { arrival_time: "2026-07-18T10:00:00.000Z", scheduled_end: "2026-07-18T18:00:00.000Z" };

  it("clears the previous person's arrival and scheduled end when a different person takes the slot", () => {
    expect(timesForReassign("user-a", "user-b", SAVED)).toEqual({ arrivalTime: "", scheduledEnd: "" });
  });

  it("clears both when the slot is unassigned or filled from empty", () => {
    expect(timesForReassign("user-a", null, SAVED)).toEqual({ arrivalTime: "", scheduledEnd: "" });
    expect(timesForReassign(null, "user-b", SAVED)).toEqual({ arrivalTime: "", scheduledEnd: "" });
  });

  it("keeps the saved times when the same person is picked again", () => {
    expect(timesForReassign("user-a", "user-a", SAVED)).toEqual({
      arrivalTime: SAVED.arrival_time,
      scheduledEnd: SAVED.scheduled_end,
    });
    expect(timesForReassign("user-a", "user-a", { arrival_time: null, scheduled_end: null })).toEqual({
      arrivalTime: "",
      scheduledEnd: "",
    });
  });
});

describe("scheduledEndToSave", () => {
  const SAVED_ISO = "2026-07-18T18:00:00.000Z"; // 14:00 New York

  it("sends an empty string to clear a saved scheduled end", () => {
    expect(scheduledEndToSave("", SAVED_ISO)).toBe("");
  });

  it("converts a typed value to a UTC instant", () => {
    expect(scheduledEndToSave("2026-07-18T15:30", SAVED_ISO)).toBe("2026-07-18T19:30:00.000Z");
    expect(scheduledEndToSave("2026-07-18T15:30", null)).toBe("2026-07-18T19:30:00.000Z");
  });

  it("saves nothing when the field matches what is already saved (including empty vs null)", () => {
    expect(scheduledEndToSave("2026-07-18T14:00", SAVED_ISO)).toBeNull();
    expect(scheduledEndToSave("", null)).toBeNull();
    expect(scheduledEndToSave("", undefined)).toBeNull();
  });
});
