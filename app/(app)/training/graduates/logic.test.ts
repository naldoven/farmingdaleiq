import { describe, expect, it } from "vitest";

import { auditDueDate, enrollmentStatusAfterAudit } from "./logic";

describe("auditDueDate", () => {
  it("is 30 days after graduated_on", () => {
    expect(auditDueDate("2026-06-01").toISOString().slice(0, 10)).toBe("2026-07-01");
  });
});

describe("enrollmentStatusAfterAudit", () => {
  it("keeps 'graduated' on pass", () => {
    expect(enrollmentStatusAfterAudit("pass")).toBe("graduated");
  });
  it("moves back to 'active' on pip", () => {
    expect(enrollmentStatusAfterAudit("pip")).toBe("active");
  });
});
