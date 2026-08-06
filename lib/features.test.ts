import { describe, expect, it } from "vitest";

import {
  APP_FEATURES,
  enabledEventKeys,
  isEventFeatureEnabled,
  isPermissionFeatureEnabled,
} from "./features";

describe("dormant product features", () => {
  it("keeps Broadcast, Breaks, and Setups switched off", () => {
    expect(APP_FEATURES).toEqual({
      broadcast: false,
      breaks: false,
      setups: false,
    });
  });

  it("disables every permission owned by the dormant features", () => {
    for (const key of [
      "feed.post_broadcast",
      "breaks.manage",
      "breaks.view",
      "setups.manage",
      "setups.view",
      "setups.post",
    ]) {
      expect(isPermissionFeatureEnabled(key), key).toBe(false);
    }
    expect(isPermissionFeatureEnabled("tasks.complete")).toBe(true);
  });

  it("removes dormant events from active consumer lists", () => {
    expect(enabledEventKeys(["task_assigned", "broadcast", "break_overdue", "setup_posted"])).toEqual([
      "task_assigned",
    ]);
    expect(isEventFeatureEnabled("recognition")).toBe(true);
  });
});
