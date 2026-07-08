/**
 * Break compliance report (ARCHITECTURE.md "Breaks — compliance engine":
 * "a compliance report shows pending, completed, overdue, and missed breaks
 * over any date range." Parity-audit HIGH finding: this report didn't exist
 * at all). Pure aggregation over plain rows — no Supabase client — so the
 * counting logic is unit-testable without a database. The caller
 * (app/(app)/breaks/report/page.tsx) fetches every `breaks` row for the
 * setups in the selected date range and passes the plain rows in here.
 */

export interface BreakComplianceRow {
  status: string;
}

export interface BreakComplianceSummary {
  total: number;
  pending: number;
  authorized: number;
  active: number;
  completed: number;
  overdue: number;
  missed: number;
}

/**
 * Counts every break by its current status. Statuses outside the known set
 * (shouldn't happen — the DB has a CHECK constraint) are counted in `total`
 * only, so a stray value never silently drops out of the report.
 */
export function summarizeBreakCompliance(rows: BreakComplianceRow[]): BreakComplianceSummary {
  const summary: BreakComplianceSummary = {
    total: 0,
    pending: 0,
    authorized: 0,
    active: 0,
    completed: 0,
    overdue: 0,
    missed: 0,
  };

  for (const row of rows) {
    summary.total += 1;
    switch (row.status) {
      case "pending":
        summary.pending += 1;
        break;
      case "authorized":
        summary.authorized += 1;
        break;
      case "active":
        summary.active += 1;
        break;
      case "completed":
        summary.completed += 1;
        break;
      case "overdue":
        summary.overdue += 1;
        break;
      case "missed":
        summary.missed += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

/** Groups compliance rows by an arbitrary key (e.g. setup date) for a per-day breakdown. */
export function groupBreakComplianceByKey<T extends BreakComplianceRow>(
  rows: T[],
  keyOf: (row: T) => string,
): { key: string; summary: BreakComplianceSummary }[] {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = byKey.get(key) ?? [];
    list.push(row);
    byKey.set(key, list);
  }

  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupRows]) => ({ key, summary: summarizeBreakCompliance(groupRows) }));
}
