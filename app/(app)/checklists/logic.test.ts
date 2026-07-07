import { describe, expect, it } from "vitest";

import {
  evaluateAnswer,
  getHoldingMode,
  getMultiChoiceOptions,
  getTemperatureRange,
  isScheduleDueOn,
  isTemperatureOutOfRange,
  planFollowUpInserts,
  storeLocalNow,
  validateSubmission,
  type FoodItemRangeLike,
  type QuestionLike,
} from "./logic";

describe("storeLocalNow (FIQ-12: store-timezone-aware cron clock)", () => {
  it("rolls the calendar date back to the store day in the evening ET window", () => {
    // 2026-07-08 01:30 UTC is still 2026-07-07 21:30 in America/New_York.
    const utc = new Date("2026-07-08T01:30:00Z");
    const local = storeLocalNow(utc, "America/New_York");
    expect(local.date).toBe("2026-07-07");
    expect(local.timeOfDay).toBe("21:30:00");
    // getDay() on the localDate must read the store-local weekday (Tuesday=2).
    expect(local.localDate.getDay()).toBe(2);
    expect(local.localDate.getDate()).toBe(7);
  });

  it("reports store-local morning time, not UTC", () => {
    // 2026-07-07 13:00 UTC == 09:00 ET (EDT, UTC-4).
    const local = storeLocalNow(new Date("2026-07-07T13:00:00Z"), "America/New_York");
    expect(local.date).toBe("2026-07-07");
    expect(local.timeOfDay).toBe("09:00:00");
  });
});

const coldHolding: QuestionLike = {
  id: "q-temp-cold",
  type: "temperature",
  allow_na: false,
  choices: { holding_mode: "cold" },
  food_item_id: "food-1",
  photo_required: false,
};

const hotHolding: QuestionLike = {
  id: "q-temp-hot",
  type: "temperature",
  allow_na: false,
  choices: { holding_mode: "hot" },
  food_item_id: "food-1",
  photo_required: false,
};

const yesNo: QuestionLike = {
  id: "q-yesno",
  type: "yes_no",
  allow_na: true,
  choices: null,
  food_item_id: null,
  photo_required: false,
};

const multiChoice: QuestionLike = {
  id: "q-multi",
  type: "multi_choice",
  allow_na: false,
  choices: ["Clean", "Dirty", "Needs repair"],
  food_item_id: null,
  photo_required: false,
};

const chicken: FoodItemRangeLike = {
  cold_min_f: 33,
  cold_max_f: 41,
  hot_min_f: 140,
  hot_max_f: 210,
};

describe("getHoldingMode", () => {
  it("defaults to cold when choices is empty", () => {
    expect(getHoldingMode({ choices: null })).toBe("cold");
  });

  it("reads hot from the choices jsonb slot", () => {
    expect(getHoldingMode({ choices: { holding_mode: "hot" } })).toBe("hot");
  });

  it("ignores an array (multi_choice shape) and defaults to cold", () => {
    expect(getHoldingMode({ choices: ["a", "b"] })).toBe("cold");
  });
});

describe("getMultiChoiceOptions", () => {
  it("returns the string array as-is", () => {
    expect(getMultiChoiceOptions({ choices: ["A", "B"] })).toEqual(["A", "B"]);
  });

  it("returns an empty array for non-array choices", () => {
    expect(getMultiChoiceOptions({ choices: { holding_mode: "hot" } })).toEqual([]);
  });
});

describe("getTemperatureRange / isTemperatureOutOfRange", () => {
  it("resolves the cold range", () => {
    expect(getTemperatureRange(chicken, "cold")).toEqual({ min: 33, max: 41 });
  });

  it("resolves the hot range", () => {
    expect(getTemperatureRange(chicken, "hot")).toEqual({ min: 140, max: 210 });
  });

  it("returns nulls when the food item is missing", () => {
    expect(getTemperatureRange(null, "cold")).toEqual({ min: null, max: null });
  });

  it("flags a value below the minimum", () => {
    expect(isTemperatureOutOfRange(30, { min: 33, max: 41 })).toBe(true);
  });

  it("flags a value above the maximum", () => {
    expect(isTemperatureOutOfRange(45, { min: 33, max: 41 })).toBe(true);
  });

  it("does not flag a value inside the range", () => {
    expect(isTemperatureOutOfRange(37, { min: 33, max: 41 })).toBe(false);
  });
});

describe("evaluateAnswer", () => {
  it("never flags an N/A answer", () => {
    const result = evaluateAnswer(coldHolding, chicken, {
      value: 20,
      isNa: true,
      manuallyFlagged: false,
    });
    expect(result).toEqual({ flagged: false, requiresCorrectiveAction: false });
  });

  it("forces a corrective action for an out-of-range cold-holding reading", () => {
    const result = evaluateAnswer(coldHolding, chicken, {
      value: 50,
      isNa: false,
      manuallyFlagged: false,
    });
    expect(result).toEqual({ flagged: true, requiresCorrectiveAction: true });
  });

  it("does not force a corrective action for an in-range hot-holding reading", () => {
    const result = evaluateAnswer(hotHolding, chicken, {
      value: 165,
      isNa: false,
      manuallyFlagged: false,
    });
    expect(result).toEqual({ flagged: false, requiresCorrectiveAction: false });
  });

  it("flags (but does not force a corrective action for) a failed yes_no answer", () => {
    const result = evaluateAnswer(yesNo, undefined, {
      value: false,
      isNa: false,
      manuallyFlagged: false,
    });
    expect(result).toEqual({ flagged: true, requiresCorrectiveAction: false });
  });

  it("does not auto-flag a passing yes_no answer", () => {
    const result = evaluateAnswer(yesNo, undefined, {
      value: true,
      isNa: false,
      manuallyFlagged: false,
    });
    expect(result.flagged).toBe(false);
  });

  it("lets any question type be manually flagged for follow-up", () => {
    const result = evaluateAnswer(multiChoice, undefined, {
      value: "Needs repair",
      isNa: false,
      manuallyFlagged: true,
    });
    expect(result.flagged).toBe(true);
    expect(result.requiresCorrectiveAction).toBe(false);
  });
});

describe("validateSubmission", () => {
  const questions = [yesNo, coldHolding];
  const foodItemsById = new Map([["food-1", chicken]]);

  it("errors when a question has no answer at all", () => {
    const errors = validateSubmission(questions, new Map(), foodItemsById);
    expect(errors).toHaveLength(2);
  });

  it("passes when every question is answered cleanly", () => {
    const answers = new Map([
      ["q-yesno", { questionId: "q-yesno", value: true, isNa: false, manuallyFlagged: false }],
      [
        "q-temp-cold",
        { questionId: "q-temp-cold", value: 37, isNa: false, manuallyFlagged: false },
      ],
    ]);
    expect(validateSubmission(questions, answers, foodItemsById)).toHaveLength(0);
  });

  it("requires a corrective action note for an out-of-range temperature answer", () => {
    const answers = new Map([
      ["q-yesno", { questionId: "q-yesno", value: true, isNa: false, manuallyFlagged: false }],
      [
        "q-temp-cold",
        {
          questionId: "q-temp-cold",
          value: 50,
          isNa: false,
          manuallyFlagged: false,
          correctiveActionNote: "",
        },
      ],
    ]);
    const errors = validateSubmission(questions, answers, foodItemsById);
    expect(errors).toHaveLength(1);
    expect(errors[0].questionId).toBe("q-temp-cold");
  });

  it("accepts the out-of-range answer once a corrective action note is present", () => {
    const answers = new Map([
      ["q-yesno", { questionId: "q-yesno", value: true, isNa: false, manuallyFlagged: false }],
      [
        "q-temp-cold",
        {
          questionId: "q-temp-cold",
          value: 50,
          isNa: false,
          manuallyFlagged: false,
          correctiveActionNote: "Moved to walk-in, re-checked in 15 min.",
        },
      ],
    ]);
    expect(validateSubmission(questions, answers, foodItemsById)).toHaveLength(0);
  });

  it("rejects N/A on a question that doesn't allow it", () => {
    const answers = new Map([
      ["q-yesno", { questionId: "q-yesno", value: true, isNa: false, manuallyFlagged: false }],
      ["q-temp-cold", { questionId: "q-temp-cold", value: null, isNa: true, manuallyFlagged: false }],
    ]);
    const errors = validateSubmission(questions, answers, foodItemsById);
    expect(errors).toHaveLength(1);
    expect(errors[0].questionId).toBe("q-temp-cold");
  });
});

describe("planFollowUpInserts", () => {
  it("plans an insert for a newly flagged answer", () => {
    const plan = planFollowUpInserts([{ id: "a1", flagged: true }], new Set());
    expect(plan).toEqual([{ source_answer_id: "a1" }]);
  });

  it("skips answers that are not flagged", () => {
    const plan = planFollowUpInserts([{ id: "a1", flagged: false }], new Set());
    expect(plan).toEqual([]);
  });

  it("is idempotent: skips an answer that already has a follow-up", () => {
    const plan = planFollowUpInserts([{ id: "a1", flagged: true }], new Set(["a1"]));
    expect(plan).toEqual([]);
  });
});

describe("isScheduleDueOn", () => {
  // 2026-07-08 is a Wednesday (day 3).
  const wednesday = new Date(2026, 6, 8);

  it("is always due for daily schedules", () => {
    expect(isScheduleDueOn({ frequency: "daily", days_of_week: null, day_of_month: null }, wednesday)).toBe(
      true,
    );
  });

  it("is always due for persistent schedules", () => {
    expect(
      isScheduleDueOn({ frequency: "persistent", days_of_week: null, day_of_month: null }, wednesday),
    ).toBe(true);
  });

  it("is due on a matching weekly day", () => {
    expect(
      isScheduleDueOn({ frequency: "weekly", days_of_week: [3], day_of_month: null }, wednesday),
    ).toBe(true);
  });

  it("is not due on a non-matching weekly day", () => {
    expect(
      isScheduleDueOn({ frequency: "weekly", days_of_week: [1, 5], day_of_month: null }, wednesday),
    ).toBe(false);
  });

  it("is due on a matching day of month", () => {
    expect(
      isScheduleDueOn({ frequency: "monthly", days_of_week: null, day_of_month: 8 }, wednesday),
    ).toBe(true);
  });

  it("is not due on a non-matching day of month", () => {
    expect(
      isScheduleDueOn({ frequency: "monthly", days_of_week: null, day_of_month: 9 }, wednesday),
    ).toBe(false);
  });
});
