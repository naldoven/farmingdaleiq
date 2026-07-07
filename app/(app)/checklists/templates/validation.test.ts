import { describe, expect, it } from "vitest";

import {
  foodItemSchema,
  questionSchema,
  scheduleSchema,
  sectionSchema,
  templateSchema,
  updateTemplateSchema,
} from "./validation";

describe("templateSchema", () => {
  it("accepts a name-only template", () => {
    expect(templateSchema.safeParse({ name: "Opening checklist" }).success).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(templateSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("updateTemplateSchema", () => {
  it("requires an id and active flag", () => {
    const result = updateTemplateSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Opening checklist",
      active: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("sectionSchema", () => {
  it("accepts a valid section", () => {
    const result = sectionSchema.safeParse({
      templateId: "11111111-1111-4111-8111-111111111111",
      name: "Cold holding",
      sort: 1,
    });
    expect(result.success).toBe(true);
  });
});

describe("questionSchema", () => {
  const base = {
    sectionId: "11111111-1111-4111-8111-111111111111",
    prompt: "Check the walk-in",
    allowNa: false,
    holdingMode: "cold" as const,
    photoRequired: false,
    tokenValue: 0,
    sort: 0,
  };

  it("accepts a yes_no question with no food item", () => {
    const result = questionSchema.safeParse({ ...base, type: "yes_no" });
    expect(result.success).toBe(true);
  });

  it("requires a food item for a temperature question", () => {
    const result = questionSchema.safeParse({ ...base, type: "temperature" });
    expect(result.success).toBe(false);
  });

  it("accepts a temperature question with a food item", () => {
    const result = questionSchema.safeParse({
      ...base,
      type: "temperature",
      foodItemId: "22222222-2222-4222-8222-222222222222",
    });
    expect(result.success).toBe(true);
  });

  it("requires choices for a multi_choice question", () => {
    const result = questionSchema.safeParse({ ...base, type: "multi_choice", choicesText: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a multi_choice question with choices", () => {
    const result = questionSchema.safeParse({
      ...base,
      type: "multi_choice",
      choicesText: "Clean, Dirty, Needs repair",
    });
    expect(result.success).toBe(true);
  });
});

describe("scheduleSchema", () => {
  const base = {
    templateId: "11111111-1111-4111-8111-111111111111",
    alertOnIncomplete: false,
  };

  it("accepts a daily schedule with no days_of_week", () => {
    expect(scheduleSchema.safeParse({ ...base, frequency: "daily", daysOfWeek: [] }).success).toBe(
      true,
    );
  });

  it("requires at least one day for a weekly schedule", () => {
    expect(scheduleSchema.safeParse({ ...base, frequency: "weekly", daysOfWeek: [] }).success).toBe(
      false,
    );
  });

  it("accepts a weekly schedule with days picked", () => {
    expect(
      scheduleSchema.safeParse({ ...base, frequency: "weekly", daysOfWeek: [2, 4, 6] }).success,
    ).toBe(true);
  });

  it("requires a day of month for a monthly schedule", () => {
    expect(scheduleSchema.safeParse({ ...base, frequency: "monthly", daysOfWeek: [] }).success).toBe(
      false,
    );
  });

  it("accepts a monthly schedule with a day of month", () => {
    expect(
      scheduleSchema.safeParse({ ...base, frequency: "monthly", daysOfWeek: [], dayOfMonth: 1 })
        .success,
    ).toBe(true);
  });

  it("accepts a persistent schedule", () => {
    expect(
      scheduleSchema.safeParse({ ...base, frequency: "persistent", daysOfWeek: [] }).success,
    ).toBe(true);
  });
});

describe("foodItemSchema", () => {
  it("accepts a food item with both holding ranges", () => {
    const result = foodItemSchema.safeParse({
      name: "Raw chicken",
      coldMinF: 33,
      coldMaxF: 41,
      hotMinF: 140,
      hotMaxF: 210,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(foodItemSchema.safeParse({ name: "" }).success).toBe(false);
  });
});
