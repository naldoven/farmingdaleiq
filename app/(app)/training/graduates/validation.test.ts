import { describe, expect, it } from "vitest";

import { recordAuditSchema } from "./validation";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("recordAuditSchema", () => {
  it("accepts pass/pip", () => {
    expect(recordAuditSchema.safeParse({ auditId: uuid, result: "pass" }).success).toBe(true);
    expect(recordAuditSchema.safeParse({ auditId: uuid, result: "pip" }).success).toBe(true);
  });
  it("rejects an unknown result", () => {
    expect(recordAuditSchema.safeParse({ auditId: uuid, result: "fail" }).success).toBe(false);
  });
});
