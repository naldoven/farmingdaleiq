import { describe, expect, it } from "vitest";

import { extractRecipientIds } from "./recipients";

describe("extractRecipientIds", () => {
  it("extracts a singular userId", () => {
    expect(extractRecipientIds({ userId: "u1" })).toEqual(["u1"]);
  });

  it("extracts snake_case singular keys", () => {
    expect(extractRecipientIds({ user_id: "u1" })).toEqual(["u1"]);
    expect(extractRecipientIds({ recipient_id: "u1" })).toEqual(["u1"]);
    expect(extractRecipientIds({ assignee_id: "u1" })).toEqual(["u1"]);
  });

  it("extracts plural arrays", () => {
    expect(extractRecipientIds({ userIds: ["u1", "u2"] })).toEqual(["u1", "u2"]);
  });

  it("reads BOTH canonical recipient keys (user_id and user_ids)", () => {
    expect(extractRecipientIds({ user_id: "u1" })).toEqual(["u1"]);
    expect(extractRecipientIds({ user_ids: ["u1", "u2"] })).toEqual(["u1", "u2"]);
    expect(extractRecipientIds({ user_id: "u1", user_ids: ["u2"] })).toEqual(["u1", "u2"]);
  });

  it("never treats the actor as a recipient", () => {
    // The canonical contract records who caused the event as `actor_id`, and
    // legacy actor-shaped keys must not leak in either. None of these are a
    // recipient.
    expect(extractRecipientIds({ actor_id: "actor-1" })).toEqual([]);
    expect(extractRecipientIds({ completed_by: "actor-1" })).toEqual([]);
    expect(extractRecipientIds({ completedBy: "actor-1" })).toEqual([]);
    expect(extractRecipientIds({ assigned_user_id: "actor-1" })).toEqual([]);
    expect(
      extractRecipientIds({ user_id: "u1", actor_id: "actor-1" }),
    ).toEqual(["u1"]);
  });

  it("dedupes across multiple matching fields", () => {
    expect(
      extractRecipientIds({ userId: "u1", recipientId: "u1", assigneeIds: ["u1", "u2"] }),
    ).toEqual(["u1", "u2"]);
  });

  it("ignores non-string entries", () => {
    expect(extractRecipientIds({ userId: 123 })).toEqual([]);
    expect(extractRecipientIds({ userIds: [123, "u2", null] })).toEqual(["u2"]);
  });

  it("returns [] for a payload with no recognizable recipient field, never throws", () => {
    expect(extractRecipientIds({ message: "store-wide broadcast" })).toEqual([]);
  });

  it("returns [] for an empty payload", () => {
    expect(extractRecipientIds({})).toEqual([]);
  });
});
