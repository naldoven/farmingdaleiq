import { describe, expect, it } from "vitest";

import { eventMarkerLikePattern, withEventMarker } from "./dedupe";

describe("withEventMarker", () => {
  it("appends the marker to a plain link", () => {
    expect(withEventMarker("/tasks/42", "evt-1")).toBe("/tasks/42?evt=evt-1");
  });

  it("appends with & when the link already has a query string", () => {
    expect(withEventMarker("/tasks?tab=mine", "evt-1")).toBe("/tasks?tab=mine&evt=evt-1");
  });

  it("falls back to /notifications when there is no link", () => {
    expect(withEventMarker(undefined, "evt-1")).toBe("/notifications?evt=evt-1");
  });
});

describe("eventMarkerLikePattern", () => {
  it("matches what withEventMarker produces", () => {
    const link = withEventMarker("/tasks/42", "evt-1");
    const pattern = eventMarkerLikePattern("evt-1")
      .replace(/^%/, "")
      .replace(/%$/, "");
    expect(link).toContain(pattern);
  });

  it("does not match a different event id", () => {
    const link = withEventMarker("/tasks/42", "evt-1");
    const pattern = eventMarkerLikePattern("evt-2")
      .replace(/^%/, "")
      .replace(/%$/, "");
    expect(link).not.toContain(pattern);
  });
});
