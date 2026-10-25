import { describe, expect, it } from "vitest";

import { walkthroughSaveSchema } from "@/app/(app)/cleaning/validation";
import { emptyItemDetails } from "@/components/cleaning/item-details-fields";
import {
  buildSavePayload,
  hasErrors,
  isShotForm,
  queueSummary,
  validateShotForm,
  type ShotForm,
} from "@/components/cleaning/walkthrough-form";

const ZONE = "11111111-1111-4111-8111-111111111111";
const PHOTO = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

function form(overrides: Partial<ShotForm> = {}): ShotForm {
  return {
    mode: "new",
    details: { ...emptyItemDetails(ZONE), name: "Prep shelf 2", kind: "constant", daysOfWeek: [3], half: "am" },
    existingItemId: null,
    existingItemName: null,
    markup: null,
    captureSource: "live",
    ...overrides,
  };
}

describe("validateShotForm", () => {
  it("passes a complete constant", () => {
    expect(validateShotForm(form())).toEqual({});
  });

  it("flags what a constant is missing", () => {
    const errors = validateShotForm(form({ details: { ...form().details, name: " ", daysOfWeek: [], half: "either" } }));
    expect(Object.keys(errors).sort()).toEqual(["daysOfWeek", "half", "name"]);
  });

  it("needs a week count for a variable", () => {
    const errors = validateShotForm(
      form({ details: { ...form().details, kind: "variable", intervalWeeks: null, half: "either" } }),
    );
    expect(errors).toEqual({ intervalWeeks: "Pick how many weeks" });
  });

  it("needs a chosen item when attaching", () => {
    expect(hasErrors(validateShotForm(form({ mode: "existing" })))).toBe(true);
    expect(validateShotForm(form({ mode: "existing", existingItemId: ITEM }))).toEqual({});
  });
});

describe("buildSavePayload", () => {
  it("builds a payload the server schema accepts for a new item", () => {
    const payload = buildSavePayload(PHOTO, "2026-10-26T22:00:00.000Z", form({ markup: { strokes: [{ points: [[0.1, 0.1]] }] } }));
    const parsed = walkthroughSaveSchema.parse(payload);
    expect(parsed.target.mode).toBe("new");
    expect(parsed.markup?.strokes).toHaveLength(1);
  });

  it("builds a payload the server schema accepts for an existing item", () => {
    const payload = buildSavePayload(PHOTO, "2026-10-26T22:00:00.000Z", form({ mode: "existing", existingItemId: ITEM }));
    expect(walkthroughSaveSchema.parse(payload).target).toEqual({ mode: "existing", itemId: ITEM });
  });

  it("sends an empty drawing as no drawing", () => {
    const payload = buildSavePayload(PHOTO, "2026-10-26T22:00:00.000Z", form({ markup: { strokes: [] } }));
    expect(payload.markup).toBeNull();
  });
});

describe("isShotForm", () => {
  it("accepts a stored form and rejects junk", () => {
    expect(isShotForm(form())).toBe(true);
    expect(isShotForm(null)).toBe(false);
    expect(isShotForm({ mode: "new" })).toBe(false);
    expect(isShotForm({ ...form(), captureSource: "gallery" })).toBe(false);
  });
});

describe("queueSummary", () => {
  it("reads like a status line", () => {
    expect(queueSummary([])).toBe("No photos yet");
    expect(queueSummary(["saved", "saved", "sending", "needs-details", "held", "waiting"])).toBe(
      "1 needs details, 1 stuck, 2 sending, 2 saved",
    );
  });
});
