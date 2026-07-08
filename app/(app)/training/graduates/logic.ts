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

/** PASS keeps the trainee graduated; PIP moves them back into development,
 * tracked under the dedicated 'pip' status (not 'active') so the Graduates
 * page -- which queries status in (graduated, pip) -- keeps showing their
 * audit history instead of the row silently vanishing. */
export function enrollmentStatusAfterAudit(result: AuditResult): "graduated" | "pip" {
  return result === "pass" ? "graduated" : "pip";
}
