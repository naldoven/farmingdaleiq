import { describe, expect, it } from "vitest";

import { buildChecklistMissedPayload } from "./discord-payload";

/**
 * N5: the checklists cron must forward each schedule's per-schedule Discord
 * controls onto the checklist_missed event so a leader can mute (or re-route)
 * the missed-alert post for one schedule. The notify consumer
 * (lib/notify/events.ts) suppresses when the payload carries
 * notify_discord: false and honors discord_channel_id as a channel override.
 */
describe("buildChecklistMissedPayload", () => {
  it("always carries runId and scheduleId", () => {
    const payload = buildChecklistMissedPayload({ runId: "run-1", scheduleId: "sched-1" });
    expect(payload).toEqual({ runId: "run-1", scheduleId: "sched-1" });
  });

  it("forwards notify_discord: false so a muted schedule suppresses the Discord post", () => {
    const payload = buildChecklistMissedPayload({
      runId: "run-1",
      scheduleId: "sched-1",
      controls: { notify_discord: false, discord_channel_id: null },
    });
    expect(payload.notify_discord).toBe(false);
    expect(payload).not.toHaveProperty("discord_channel_id");
  });

  it("forwards notify_discord: true and a channel override when set", () => {
    const payload = buildChecklistMissedPayload({
      runId: "run-1",
      scheduleId: "sched-1",
      controls: { notify_discord: true, discord_channel_id: "chan-override" },
    });
    expect(payload.notify_discord).toBe(true);
    expect(payload.discord_channel_id).toBe("chan-override");
  });

  it("omits both control fields when there are no controls for the schedule", () => {
    const payload = buildChecklistMissedPayload({
      runId: "run-1",
      scheduleId: "sched-1",
      controls: undefined,
    });
    expect(payload).not.toHaveProperty("notify_discord");
    expect(payload).not.toHaveProperty("discord_channel_id");
  });

  it("omits discord_channel_id when the schedule has no channel override", () => {
    const payload = buildChecklistMissedPayload({
      runId: "run-1",
      scheduleId: "sched-1",
      controls: { notify_discord: true, discord_channel_id: null },
    });
    expect(payload.notify_discord).toBe(true);
    expect(payload).not.toHaveProperty("discord_channel_id");
  });
});
