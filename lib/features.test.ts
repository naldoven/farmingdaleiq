import { afterEach, describe, expect, it } from "vitest";

import {
  APP_FEATURES,
  type AppFeature,
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
});

describe("rollback: switching a module off", () => {
  // The real permission/event mapping in lib/features.ts, with one switch
  // flipped at a time. APP_FEATURES is read at call time, so Object.assign on
  // it is exactly what editing the flag in source would do.
  const original = { ...APP_FEATURES };
  afterEach(() => {
    Object.assign(APP_FEATURES, original);
  });

  const OWNED: Record<AppFeature, { permissions: string[]; events: string[] }> = {
    broadcast: { permissions: ["feed.post_broadcast"], events: ["broadcast"] },
    breaks: { permissions: ["breaks.manage", "breaks.view"], events: ["break_overdue"] },
    setups: { permissions: ["setups.manage", "setups.view", "setups.post"], events: ["setup_posted"] },
  };
  const FEATURES = Object.keys(OWNED) as AppFeature[];
  const UNRELATED_PERMISSIONS = ["tasks.complete", "people.manage"];
  const UNRELATED_EVENTS = ["task_assigned", "recognition"];

  it.each(FEATURES)("hides only the %s permissions and events when that switch is off", (feature) => {
    Object.assign(APP_FEATURES, { [feature]: false });

    for (const key of OWNED[feature].permissions) expect(isPermissionFeatureEnabled(key), key).toBe(false);
    for (const key of OWNED[feature].events) expect(isEventFeatureEnabled(key), key).toBe(false);

    // Everything else stays on: the other modules and keys no module owns.
    for (const other of FEATURES.filter((f) => f !== feature)) {
      for (const key of OWNED[other].permissions) expect(isPermissionFeatureEnabled(key), key).toBe(true);
      for (const key of OWNED[other].events) expect(isEventFeatureEnabled(key), key).toBe(true);
    }
    for (const key of UNRELATED_PERMISSIONS) expect(isPermissionFeatureEnabled(key), key).toBe(true);
    for (const key of UNRELATED_EVENTS) expect(isEventFeatureEnabled(key), key).toBe(true);
  });

  it("drops a switched-off module's events from a consumer key list", () => {
    Object.assign(APP_FEATURES, { breaks: false });

    expect(enabledEventKeys(["task_assigned", "broadcast", "break_overdue", "setup_posted"])).toEqual([
      "task_assigned",
      "broadcast",
      "setup_posted",
    ]);
  });

  it("hides everything when all three switches are off", () => {
    Object.assign(APP_FEATURES, { broadcast: false, breaks: false, setups: false });

    const permissions = FEATURES.flatMap((f) => OWNED[f].permissions);
    const events = FEATURES.flatMap((f) => OWNED[f].events);
    for (const key of permissions) expect(isPermissionFeatureEnabled(key), key).toBe(false);
    expect(enabledEventKeys([...events, "task_assigned"])).toEqual(["task_assigned"]);
  });
});
