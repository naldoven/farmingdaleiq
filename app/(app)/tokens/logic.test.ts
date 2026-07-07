import { describe, expect, it } from "vitest";

import {
  canAffordGift,
  resolveAwardsForEvents,
  resolveEarnAmount,
  transactionKindLabel,
} from "@/app/(app)/tokens/logic";

describe("transactionKindLabel", () => {
  it("maps known kinds to display labels", () => {
    expect(transactionKindLabel("earn")).toBe("Earned");
    expect(transactionKindLabel("gift_in")).toBe("Gift received");
    expect(transactionKindLabel("redeem")).toBe("Reward redeemed");
  });

  it("falls back to the raw kind for anything unknown", () => {
    expect(transactionKindLabel("mystery")).toBe("mystery");
  });
});

describe("canAffordGift", () => {
  it("allows a gift within balance", () => {
    expect(canAffordGift(50, 20)).toBe(true);
  });

  it("rejects a gift exceeding balance", () => {
    expect(canAffordGift(10, 20)).toBe(false);
  });

  it("rejects a zero or negative amount", () => {
    expect(canAffordGift(50, 0)).toBe(false);
    expect(canAffordGift(50, -5)).toBe(false);
  });
});

describe("resolveEarnAmount", () => {
  it("prefers a positive payload token_value over the rule amount", () => {
    expect(resolveEarnAmount(15, 5)).toBe(15);
  });

  it("falls back to the rule amount when payload token_value is missing", () => {
    expect(resolveEarnAmount(undefined, 5)).toBe(5);
  });

  it("falls back to the rule amount when payload token_value is not positive", () => {
    expect(resolveEarnAmount(0, 5)).toBe(5);
    expect(resolveEarnAmount(-3, 5)).toBe(5);
  });

  it("truncates fractional values", () => {
    expect(resolveEarnAmount(4.9, 0)).toBe(4);
  });

  it("never returns a negative amount", () => {
    expect(resolveEarnAmount(undefined, -10)).toBe(0);
  });
});

describe("resolveAwardsForEvents", () => {
  const rules = { task_complete: 5, checklist_complete: 3, top_performer: 20 };

  it("resolves one award per event carrying a user_id and a positive amount", () => {
    const awards = resolveAwardsForEvents(
      [
        { id: "e1", event_key: "task_complete", payload: { user_id: "u1" } },
        { id: "e2", event_key: "checklist_complete", payload: { user_id: "u2", token_value: 10 } },
        { id: "e3", event_key: "top_performer", payload: { user_id: "u3" } },
      ],
      rules
    );

    expect(awards).toEqual([
      { eventId: "e1", userId: "u1", amount: 5, kind: "earn" },
      { eventId: "e2", userId: "u2", amount: 10, kind: "earn" },
      { eventId: "e3", userId: "u3", amount: 20, kind: "top_performer" },
    ]);
  });

  it("skips events with no user_id in the payload", () => {
    const awards = resolveAwardsForEvents(
      [{ id: "e1", event_key: "task_complete", payload: {} }],
      rules
    );
    expect(awards).toEqual([]);
  });

  it("skips events that resolve to a non-positive amount", () => {
    const awards = resolveAwardsForEvents(
      [{ id: "e1", event_key: "task_complete", payload: { user_id: "u1" } }],
      { task_complete: 0 }
    );
    expect(awards).toEqual([]);
  });

  it("skips events for an event_key with no configured rule", () => {
    const awards = resolveAwardsForEvents(
      [{ id: "e1", event_key: "some_unrelated_key", payload: { user_id: "u1" } }],
      rules
    );
    expect(awards).toEqual([]);
  });
});
