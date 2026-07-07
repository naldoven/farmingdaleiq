import { describe, expect, it } from "vitest";

import {
  createPassportItemSchema,
  enrollPassportSchema,
  signItemSchema,
  stampPassportSchema,
  submitCourseFeedbackSchema,
  upsertItemProgressSchema,
} from "./validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("createPassportItemSchema", () => {
  it("accepts a valid check item", () => {
    expect(
      createPassportItemSchema.safeParse({ passportId: uuid, type: "check", label: "Knows the fryer", sort: 1 })
        .success,
    ).toBe(true);
  });
  it("rejects an unknown item type", () => {
    expect(
      createPassportItemSchema.safeParse({ passportId: uuid, type: "video", label: "x", sort: 1 }).success,
    ).toBe(false);
  });
  it("rejects a blank label", () => {
    expect(createPassportItemSchema.safeParse({ passportId: uuid, type: "check", label: "" }).success).toBe(false);
  });
});

describe("enrollPassportSchema", () => {
  it("allows an optional track", () => {
    expect(enrollPassportSchema.safeParse({ passportId: uuid, userId: uuid }).success).toBe(true);
    expect(enrollPassportSchema.safeParse({ passportId: uuid, userId: uuid, track: "DT/FC" }).success).toBe(true);
  });
});

describe("upsertItemProgressSchema", () => {
  it("accepts a checked-only payload", () => {
    expect(upsertItemProgressSchema.safeParse({ enrollmentId: uuid, itemId: uuid, checked: true }).success).toBe(
      true,
    );
  });
  it("rejects a slider value over 100", () => {
    expect(
      upsertItemProgressSchema.safeParse({ enrollmentId: uuid, itemId: uuid, sliderValue: 150 }).success,
    ).toBe(false);
  });
});

describe("signItemSchema / stampPassportSchema", () => {
  it("require uuids", () => {
    expect(signItemSchema.safeParse({ enrollmentId: uuid, itemId: uuid }).success).toBe(true);
    expect(stampPassportSchema.safeParse({ enrollmentId: uuid }).success).toBe(true);
    expect(stampPassportSchema.safeParse({ enrollmentId: "nope" }).success).toBe(false);
  });
});

describe("submitCourseFeedbackSchema", () => {
  it("bounds rating 1-5", () => {
    expect(submitCourseFeedbackSchema.safeParse({ courseId: uuid, rating: 5 }).success).toBe(true);
    expect(submitCourseFeedbackSchema.safeParse({ courseId: uuid, rating: 6 }).success).toBe(false);
    expect(submitCourseFeedbackSchema.safeParse({ courseId: uuid, rating: 0 }).success).toBe(false);
  });
});
