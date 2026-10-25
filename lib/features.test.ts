import { describe, expect, it } from "vitest";

import {
  APP_FEATURES,
  enabledEventKeys,
  isEventFeatureEnabled,
  isPermissionFeatureEnabled,
} from "./features";

describe("dormant product features", () => {
  it("keeps Broadcast switched off; Breaks and Setups are live", () => {
    expect(APP_FEATURES).toEqual({
      broadcast: false,
      breaks: true,
      setups: true,
    });
  });

  it("disables every permission owned by the dormant features", () => {
    expect(isPermissionFeatureEnabled("feed.post_broadcast")).toBe(false);
    for (const key of [
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

  it("removes dormant events from active consumer lists", () => {
    expect(enabledEventKeys(["task_assigned", "broadcast", "break_overdue", "setup_posted"])).toEqual([
      "task_assigned",
      "break_overdue",
      "setup_posted",
    ]);
    expect(isEventFeatureEnabled("recognition")).toBe(true);
    expect(isEventFeatureEnabled("broadcast")).toBe(false);
  });
});
