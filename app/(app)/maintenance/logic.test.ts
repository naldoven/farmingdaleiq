import { describe, expect, it } from "vitest";
import { extractRecipientIds } from "@/lib/notify/recipients";
import {
  addDays,
  discordFlagPayload,
  isPmScheduleDue,
  isValidWorkOrderTransition,
  pmChecklistRunInsert,
  planPmGeneration,
  requesterRecipientPayload,
  resolvePmPriority,
  type PmScheduleLike,
} from "./logic";

describe("addDays", () => {
  it("adds positive days within a month", () => {
    expect(addDays("2026-07-01", 5)).toBe("2026-07-06");
  });

  it("subtracts days across a month boundary", () => {
    expect(addDays("2026-07-05", -10)).toBe("2026-06-25");
  });

  it("handles a year boundary", () => {
    expect(addDays("2026-12-30", 5)).toBe("2027-01-04");
  });
});

describe("isValidWorkOrderTransition", () => {
  it("allows open -> in_progress", () => {
    expect(isValidWorkOrderTransition("open", "in_progress")).toBe(true);
  });

  it("allows in_progress -> complete", () => {
    expect(isValidWorkOrderTransition("in_progress", "complete")).toBe(true);
  });

  it("allows on_hold -> in_progress (resuming)", () => {
    expect(isValidWorkOrderTransition("on_hold", "in_progress")).toBe(true);
  });

  it("rejects open -> complete (must pass through in_progress)", () => {
    expect(isValidWorkOrderTransition("open", "complete")).toBe(false);
  });

  it("rejects any transition out of a terminal complete state", () => {
    expect(isValidWorkOrderTransition("complete", "open")).toBe(false);
    expect(isValidWorkOrderTransition("complete", "in_progress")).toBe(false);
  });

  it("rejects any transition out of a terminal cancelled state", () => {
    expect(isValidWorkOrderTransition("cancelled", "open")).toBe(false);
  });
});

function schedule(overrides: Partial<PmScheduleLike> = {}): PmScheduleLike {
  return {
    id: "sched-1",
    equipment_id: "equip-1",
    title: "Hood cleaning",
    description: null,
    interval_days: 90,
    lead_days: 7,
    next_due_on: "2026-07-15",
    checklist_template_id: null,
    assign_user_id: null,
    vendor_id: null,
    priority: "medium",
    active: true,
    ...overrides,
  };
}

describe("isPmScheduleDue", () => {
  it("is not due well before the lead window", () => {
    expect(isPmScheduleDue(schedule(), "2026-07-01")).toBe(false);
  });

  it("becomes due exactly lead_days before next_due_on", () => {
    expect(isPmScheduleDue(schedule(), "2026-07-08")).toBe(true);
  });

  it("stays due after next_due_on has passed (a missed sweep still catches it)", () => {
    expect(isPmScheduleDue(schedule(), "2026-07-20")).toBe(true);
  });

  it("is never due when inactive", () => {
    expect(isPmScheduleDue(schedule({ active: false }), "2026-07-20")).toBe(false);
  });

  it("is never due with no next_due_on set", () => {
    expect(isPmScheduleDue(schedule({ next_due_on: null }), "2026-07-20")).toBe(false);
  });
});

describe("planPmGeneration", () => {
  it("includes a due schedule with no existing open work order", () => {
    const result = planPmGeneration([schedule()], new Set(), "2026-07-15");
    expect(result.map((s) => s.id)).toEqual(["sched-1"]);
  });

  it("is idempotent: skips a schedule that already has an open work order", () => {
    const result = planPmGeneration([schedule()], new Set(["sched-1"]), "2026-07-15");
    expect(result).toEqual([]);
  });

  it("excludes schedules that are not yet due", () => {
    const result = planPmGeneration([schedule({ next_due_on: "2026-09-01" })], new Set(), "2026-07-15");
    expect(result).toEqual([]);
  });
});

describe("resolvePmPriority", () => {
  it("passes through a valid priority", () => {
    expect(resolvePmPriority("urgent")).toBe("urgent");
  });

  it("defaults to medium for null/invalid input", () => {
    expect(resolvePmPriority(null)).toBe("medium");
    expect(resolvePmPriority("not-a-priority")).toBe("medium");
  });
});

describe("requesterRecipientPayload (contract: real payload through the real recipient extractor)", () => {
  it("produces a user_id field the real extractRecipientIds resolves", () => {
    const payload = requesterRecipientPayload("user-1");
    expect(payload).toEqual({ user_id: "user-1" });
    expect(extractRecipientIds(payload)).toEqual(["user-1"]);
  });

  it("omits the key (and resolves no recipient) when there's no requester", () => {
    const payload = requesterRecipientPayload(null);
    expect(payload).toEqual({});
    expect(extractRecipientIds(payload)).toEqual([]);
  });

  it("merges safely alongside the rest of a maint_request event payload", () => {
    const payload = { requestId: "req-1", status: "approved", ...requesterRecipientPayload("user-2") };
    expect(extractRecipientIds(payload)).toEqual(["user-2"]);
  });
});

describe("pmChecklistRunInsert", () => {
  it("returns null when the schedule has no checklist procedure attached", () => {
    expect(pmChecklistRunInsert(schedule({ checklist_template_id: null }), "2026-07-15")).toBeNull();
  });

  it("builds a checklist_runs insert from the schedule's template and assignee", () => {
    const result = pmChecklistRunInsert(
      schedule({ checklist_template_id: "tmpl-1", assign_user_id: "user-9" }),
      "2026-07-15",
    );
    expect(result).toEqual({ template_id: "tmpl-1", run_date: "2026-07-15", assigned_user_id: "user-9" });
  });

  it("carries a null assignee through when the schedule has none", () => {
    const result = pmChecklistRunInsert(
      schedule({ checklist_template_id: "tmpl-1", assign_user_id: null }),
      "2026-07-15",
    );
    expect(result?.assigned_user_id).toBeNull();
  });
});

describe("discordFlagPayload", () => {
  it("forwards nothing when notify_discord is off (the column default)", () => {
    expect(discordFlagPayload({ notify_discord: false, discord_channel_id: null })).toEqual({});
  });

  it("forwards nothing when off even if a channel id is somehow set", () => {
    expect(discordFlagPayload({ notify_discord: false, discord_channel_id: "chan-1" })).toEqual({});
  });

  it("forwards notifyDiscord + discordChannelId when explicitly opted in with a channel", () => {
    expect(discordFlagPayload({ notify_discord: true, discord_channel_id: "chan-1" })).toEqual({
      notifyDiscord: true,
      discordChannelId: "chan-1",
    });
  });

  it("forwards just notifyDiscord when opted in with no specific channel", () => {
    expect(discordFlagPayload({ notify_discord: true, discord_channel_id: null })).toEqual({
      notifyDiscord: true,
    });
  });
});
