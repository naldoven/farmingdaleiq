import { describe, expect, it } from "vitest";

import {
  buildChecklistCompletePayload,
  buildFollowUpEventPayload,
} from "@/app/(app)/checklists/logic";
import { resolveAwardsForEvents } from "@/app/(app)/tokens/logic";
import { extractRecipientIds } from "@/lib/notify/recipients";

/**
 * Cross-module contract tests: push the REAL payload the Checklists producer
 * emits through the REAL consumers (the tokens earning resolver and the
 * notification recipient extractor). The audited bug was each side testing its
 * own fabricated payload shape, so both stayed green while the integration was
 * dead. These tests fail if the field names ever drift apart again.
 */
describe("checklist_complete -> tokens earning consumer", () => {
  it("resolves the completer as the recipient and the summed token_value as the amount", () => {
    const payload = buildChecklistCompletePayload({
      runId: "run-1",
      templateId: "tmpl-1",
      completedBy: "user-1",
      tokenValue: 30,
      flaggedCount: 0,
      followUpsCreated: 0,
    });

    const awards = resolveAwardsForEvents(
      [{ id: "evt-1", event_key: "checklist_complete", payload }],
      { checklist_complete: 5 },
    );

    expect(awards).toHaveLength(1);
    expect(awards[0].userId).toBe("user-1");
    // token_value on the payload wins over the flat rule.
    expect(awards[0].amount).toBe(30);
    expect(awards[0].kind).toBe("earn");
  });

  it("falls back to the flat earning rule when no per-question token_value summed", () => {
    const payload = buildChecklistCompletePayload({
      runId: "run-2",
      templateId: "tmpl-1",
      completedBy: "user-2",
      tokenValue: 0,
      flaggedCount: 0,
      followUpsCreated: 0,
    });

    const awards = resolveAwardsForEvents(
      [{ id: "evt-2", event_key: "checklist_complete", payload }],
      { checklist_complete: 5 },
    );

    expect(awards).toHaveLength(1);
    expect(awards[0].userId).toBe("user-2");
    expect(awards[0].amount).toBe(5);
  });

  it("skips the award when there is no completer", () => {
    const payload = buildChecklistCompletePayload({
      runId: "run-3",
      templateId: "tmpl-1",
      completedBy: null,
      tokenValue: 10,
      flaggedCount: 0,
      followUpsCreated: 0,
    });

    const awards = resolveAwardsForEvents(
      [{ id: "evt-3", event_key: "checklist_complete", payload }],
      { checklist_complete: 5 },
    );

    expect(awards).toHaveLength(0);
  });
});

describe("checklist_complete -> notification recipient extractor", () => {
  it("recognizes the completer as a notification recipient", () => {
    const payload = buildChecklistCompletePayload({
      runId: "run-1",
      templateId: "tmpl-1",
      completedBy: "user-1",
      tokenValue: 0,
      flaggedCount: 0,
      followUpsCreated: 0,
    });
    expect(extractRecipientIds(payload)).toEqual(["user-1"]);
  });
});

describe("follow_up_assigned -> notification recipient extractor", () => {
  it("resolves the assignee via the canonical user_id key", () => {
    const payload = buildFollowUpEventPayload({
      followUpId: "fu-1",
      sourceAnswerId: "ans-1",
      runId: "run-1",
      title: "Follow-up: walk-in temp",
      description: "detail",
      assigneeId: "user-9",
    });
    expect(extractRecipientIds(payload)).toEqual(["user-9"]);
  });

  it("resolves to no recipient when the follow-up is unassigned", () => {
    const payload = buildFollowUpEventPayload({
      followUpId: "fu-2",
      sourceAnswerId: "ans-2",
      runId: "run-1",
      title: "Follow-up",
      description: "detail",
      assigneeId: null,
    });
    expect(extractRecipientIds(payload)).toEqual([]);
  });
});
