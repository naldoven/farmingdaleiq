import { describe, expect, it } from "vitest";

import {
  addCommentSchema,
  createBroadcastSchema,
  createRecognitionSchema,
} from "@/app/(app)/team/validation";

describe("createRecognitionSchema", () => {
  it("accepts a valid recognition", () => {
    const result = createRecognitionSchema.safeParse({
      subjectUserId: "11111111-1111-4111-8111-111111111111",
      amount: 10,
      body: "Crushed it on the line today",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty shoutout body", () => {
    expect(
      createRecognitionSchema.safeParse({
        subjectUserId: "11111111-1111-4111-8111-111111111111",
        amount: 10,
        body: "",
      }).success
    ).toBe(false);
  });

  it("rejects a non-positive amount", () => {
    expect(
      createRecognitionSchema.safeParse({
        subjectUserId: "11111111-1111-4111-8111-111111111111",
        amount: 0,
        body: "Nice",
      }).success
    ).toBe(false);
  });
});

describe("createBroadcastSchema", () => {
  it("accepts a non-empty broadcast", () => {
    expect(createBroadcastSchema.safeParse({ body: "New policy rollout Monday" }).success).toBe(true);
  });

  it("rejects an empty broadcast", () => {
    expect(createBroadcastSchema.safeParse({ body: "" }).success).toBe(false);
  });
});

describe("addCommentSchema", () => {
  it("accepts a valid comment", () => {
    expect(
      addCommentSchema.safeParse({ postId: "11111111-1111-4111-8111-111111111111", body: "Nice work!" }).success
    ).toBe(true);
  });

  it("rejects an empty comment", () => {
    expect(
      addCommentSchema.safeParse({ postId: "11111111-1111-4111-8111-111111111111", body: "" }).success
    ).toBe(false);
  });
});
