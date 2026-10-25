import { describe, expect, it } from "vitest";

import {
  APP_FEATURES,
  enabledEventKeys,
  isEventFeatureEnabled,
  isPermissionFeatureEnabled,
} from "./features";

describe("dormant product features", () => {
  it("keeps Broadcast and Setups switched off; Breaks is live", () => {
    expect(APP_FEATURES).toEqual({
      broadcast: false,
      breaks: true,
      setups: false,
    });
  });

  it("disables every permission owned by the dormant features", () => {
    for (const key of ["feed.post_broadcast", "setups.manage", "setups.view", "setups.post"]) {
      expect(isPermissionFeatureEnabled(key), key).toBe(false);
    }
    for (const key of ["breaks.manage", "breaks.view", "tasks.complete"]) {
      expect(isPermissionFeatureEnabled(key), key).toBe(true);
    }
  });

  it("removes dormant events from active consumer lists", () => {
    expect(enabledEventKeys(["task_assigned", "broadcast", "break_overdue", "setup_posted"])).toEqual([
      "task_assigned",
      "break_overdue",
    ]);
    expect(isEventFeatureEnabled("recognition")).toBe(true);
    expect(isEventFeatureEnabled("break_overdue")).toBe(true);
  });
});
