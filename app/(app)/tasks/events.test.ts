import { describe, expect, it } from "vitest";

// The REAL cross-module consumers — not fabricated fixtures. This is the whole
// point of the parity audit's contract-test mandate: push each Tasks producer's
// actual emitted payload through the code that actually reads it, so a
// field-name drift fails here instead of silently dropping tokens/notifications.
import { resolveAwardsForEvents } from "@/app/(app)/tokens/logic";
import { extractRecipientIds } from "@/lib/notify/recipients";

import {
  buildTaskAssignedEvent,
  buildTaskCompleteEvent,
  buildTaskOverdueEvent,
} from "./events";

describe("task_complete → tokens earning consumer (resolveAwardsForEvents)", () => {
  it("resolves the completer as recipient and uses the per-task token_value", () => {
    const payload = buildTaskCompleteEvent({
      taskId: "task-1",
      kind: "adhoc",
      tokenValue: 25,
      userId: "user-1",
    });

    const awards = resolveAwardsForEvents(
      [{ id: "evt-1", event_key: "task_complete", payload }],
      { task_complete: 5 }, // flat rule; the per-task value should win
    );

    expect(awards).toEqual([
      { eventId: "evt-1", userId: "user-1", amount: 25, kind: "earn" },
    ]);
  });

  it("falls back to the flat rule when the task carries no token_value", () => {
    const payload = buildTaskCompleteEvent({
      taskId: "task-2",
      kind: "recurring",
      tokenValue: 0,
      userId: "user-2",
    });

    const awards = resolveAwardsForEvents(
      [{ id: "evt-2", event_key: "task_complete", payload }],
      { task_complete: 8 },
    );

    expect(awards).toEqual([
      { eventId: "evt-2", userId: "user-2", amount: 8, kind: "earn" },
    ]);
  });
});

describe("task recipient payloads → notify recipient extractor (extractRecipientIds)", () => {
  it("task_assigned to a person resolves that person as the recipient", () => {
    const payload = buildTaskAssignedEvent({
      taskId: "task-1",
      assignedUserId: "user-1",
      actorId: "manager-1",
    });
    expect(extractRecipientIds(payload)).toEqual(["user-1"]);
  });

  it("task_assigned to a position only (no person) resolves to no recipient", () => {
    const payload = buildTaskAssignedEvent({
      taskId: "task-1",
      assignedUserId: null,
      assignedPositionId: "position-1",
    });
    expect(extractRecipientIds(payload)).toEqual([]);
  });

  it("the actor is never treated as the recipient", () => {
    const payload = buildTaskAssignedEvent({
      taskId: "task-1",
      assignedUserId: "user-1",
      actorId: "manager-1",
    });
    // manager-1 (actor_id) must not leak into the recipient set.
    expect(extractRecipientIds(payload)).not.toContain("manager-1");
  });

  it("task_overdue resolves the task owner as the recipient", () => {
    const payload = buildTaskOverdueEvent({
      taskId: "task-1",
      title: "Stock napkins",
      assignedUserId: "user-3",
      assignedPositionId: null,
    });
    expect(extractRecipientIds(payload)).toEqual(["user-3"]);
  });
});
