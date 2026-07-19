import { describe, expect, it } from "vitest";

import { createSessionSchema, deleteSessionSchema } from "./validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("createSessionSchema", () => {
  it("accepts a minimal valid session", () => {
    expect(createSessionSchema.safeParse({ enrollmentId: uuid, date: "2026-07-10" }).success).toBe(true);
  });
  it("requires a date", () => {
    expect(createSessionSchema.safeParse({ enrollmentId: uuid, date: "" }).success).toBe(false);
  });
  it("defaults tags to an empty array", () => {
    const result = createSessionSchema.parse({ enrollmentId: uuid, date: "2026-07-10" });
    expect(result.tags).toEqual([]);
  });

  // TR8: a session whose end is not after its start is 0 (or negative) hours.
  it("accepts end after start", () => {
    const parsed = createSessionSchema.safeParse({
      enrollmentId: uuid,
      date: "2026-07-10",
      startTime: "09:00",
      endTime: "11:30",
    });
    expect(parsed.success).toBe(true);
  });
  it("rejects end equal to start", () => {
    const parsed = createSessionSchema.safeParse({
      enrollmentId: uuid,
      date: "2026-07-10",
      startTime: "09:00",
      endTime: "09:00",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.message).toMatch(/after the start/i);
  });
  it("rejects end before start", () => {
    const parsed = createSessionSchema.safeParse({
      enrollmentId: uuid,
      date: "2026-07-10",
      startTime: "11:00",
      endTime: "09:00",
    });
    expect(parsed.success).toBe(false);
  });
  it("still accepts a session with no times set", () => {
    const parsed = createSessionSchema.safeParse({ enrollmentId: uuid, date: "2026-07-10" });
    expect(parsed.success).toBe(true);
  });
});

describe("deleteSessionSchema", () => {
  it("requires a uuid", () => {
    expect(deleteSessionSchema.safeParse({ id: uuid }).success).toBe(true);
    expect(deleteSessionSchema.safeParse({ id: "x" }).success).toBe(false);
  });
});
