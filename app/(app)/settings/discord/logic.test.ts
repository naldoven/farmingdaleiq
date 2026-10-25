import { describe, expect, it } from "vitest";

import { silentEventKeys } from "./logic";

const KEYS = ["recognition", "task_overdue", "broadcast", "pm_due", "reward_claim"];
const CHANNELS = [
  { id: "team", active: true },
  { id: "old", active: false },
];

describe("silentEventKeys", () => {
  it("lists every key when nothing is routed", () => {
    expect(silentEventKeys(KEYS, [], CHANNELS).map((s) => s.eventKey)).toEqual(KEYS);
  });

  it("drops a key with an enabled route to an active channel", () => {
    const routes = [{ event_key: "recognition", channel_id: "team", enabled: true }];
    const silent = silentEventKeys(KEYS, routes, CHANNELS);
    expect(silent.map((s) => s.eventKey)).not.toContain("recognition");
    expect(silent).toHaveLength(KEYS.length - 1);
  });

  it("names the reason for each silent key", () => {
    const routes = [
      { event_key: "task_overdue", channel_id: null, enabled: true },
      { event_key: "broadcast", channel_id: "team", enabled: false },
      { event_key: "pm_due", channel_id: "old", enabled: true },
      { event_key: "reward_claim", channel_id: "gone", enabled: true },
    ];
    expect(silentEventKeys(KEYS, routes, CHANNELS)).toEqual([
      { eventKey: "recognition", reason: "no_route" },
      { eventKey: "task_overdue", reason: "no_channel" },
      { eventKey: "broadcast", reason: "disabled" },
      { eventKey: "pm_due", reason: "channel_inactive" },
      { eventKey: "reward_claim", reason: "channel_inactive" },
    ]);
  });

  it("keeps the order of the event key list, not the route rows", () => {
    const routes = [
      { event_key: "pm_due", channel_id: null, enabled: true },
      { event_key: "recognition", channel_id: null, enabled: true },
    ];
    const silent = silentEventKeys(["recognition", "pm_due"], routes, CHANNELS);
    expect(silent.map((s) => s.eventKey)).toEqual(["recognition", "pm_due"]);
  });

  it("returns an empty list when every key is covered", () => {
    const routes = KEYS.map((event_key) => ({ event_key, channel_id: "team", enabled: true }));
    expect(silentEventKeys(KEYS, routes, CHANNELS)).toEqual([]);
  });
});
