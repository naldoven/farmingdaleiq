/** Pure helpers for Graduation + the 30-day audit
 * (ARCHITECTURE.md "Trainee lifecycle" > "Graduation"): "Thirty days later a
 * graduation audit is due: PASS locks graduation in; PIP moves the person
 * back into development with a note." */

export const GRADUATION_AUDIT_DELAY_DAYS = 30;

export function auditDueDate(graduatedOn: string | Date): Date {
  const graduated = typeof graduatedOn === "string" ? new Date(graduatedOn) : graduatedOn;
  const due = new Date(graduated);
  due.setDate(due.getDate() + GRADUATION_AUDIT_DELAY_DAYS);
  return due;
}

export type AuditResult = "pass" | "pip";

/** PASS keeps the trainee graduated; PIP sends them back into development. */
export function enrollmentStatusAfterAudit(result: AuditResult): "graduated" | "active" {
  return result === "pass" ? "graduated" : "active";
}
