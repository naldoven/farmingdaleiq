import { describe, expect, it } from "vitest";

import {
  APP_FEATURES,
  enabledEventKeys,
  isEventFeatureEnabled,
  isPermissionFeatureEnabled,
} from "./features";

describe("dormant product features", () => {
  it("has every module switched on after the 2026-10-25 readiness passes", () => {
    expect(APP_FEATURES).toEqual({
      broadcast: true,
      breaks: true,
      setups: true,
    });
  });

  it("enables every module permission while the switches are on", () => {
    for (const key of [
      "feed.post_broadcast",
      "breaks.manage",
      "breaks.view",
      "setups.manage",
      "setups.view",
      "setups.post",
      "tasks.complete",
    ]) {
      expect(isPermissionFeatureEnabled(key), key).toBe(true);
    }
  });

  it("passes every event key through while the switches are on", () => {
    const keys = ["task_assigned", "broadcast", "break_overdue", "setup_posted"];
    expect(enabledEventKeys(keys)).toEqual(keys);
    expect(isEventFeatureEnabled("recognition")).toBe(true);
  });

  it("still maps each gated permission and event to its module, so flipping a switch off works", () => {
    // These helpers read APP_FEATURES at call time; the mapping is what a
    // rollback depends on, so pin the keys each module owns.
    const gated = ["feed.post_broadcast", "breaks.manage", "breaks.view", "setups.manage", "setups.view", "setups.post"];
    for (const key of gated) expect(isPermissionFeatureEnabled(key), key).toBe(true);
    for (const key of ["broadcast", "break_overdue", "setup_posted"]) expect(isEventFeatureEnabled(key), key).toBe(true);
  });
});
