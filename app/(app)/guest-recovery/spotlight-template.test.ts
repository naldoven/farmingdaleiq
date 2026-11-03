import { describe, expect, it } from "vitest";

import { REASONS, spotlightTemplateFor } from "@/app/(app)/guest-recovery/constants";

describe("spotlightTemplateFor", () => {
  it("suggests the order template for item and quality problems", () => {
    for (const reason of ["missing_item", "wrong_item", "quality"] as const) {
      expect(spotlightTemplateFor(reason)).toBe("Order Complaint with Offer");
    }
  });

  it("suggests the service template for slow service, other, and recoveries with no reason", () => {
    expect(spotlightTemplateFor("too_slow")).toBe("Service & Staff Complaint with Offer");
    expect(spotlightTemplateFor("other")).toBe("Service & Staff Complaint with Offer");
    expect(spotlightTemplateFor(null)).toBe("Service & Staff Complaint with Offer");
  });

  it("answers every reason", () => {
    for (const reason of REASONS) expect(spotlightTemplateFor(reason)).toBeTruthy();
  });
});
