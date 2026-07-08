import { ListRow, SectionCard } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";

import { REPORT_TYPES } from "./report-types";

/**
 * /reports -- the KitchenIQ Reporting hub (ARCHITECTURE.md "Reporting";
 * PLAN.md P2 item 2): a plain list of report types (Overview, Waste,
 * Accountability, Checklists, Tokens & rewards, Training, Maintenance), each
 * a ListRow (tinted icon chip + bold title + gray description + chevron)
 * linking to its own /reports/<slug> page.
 *
 * Visual/layout only: this used to be one page with a Tabs strip; every
 * report now lives at its own route, but each route reuses the exact same
 * queries (./queries.ts), pure aggregation logic (./logic.ts), and
 * permission checks (lib/auth/permissions) the old tabs used -- see each
 * app/(app)/reports/<slug>/page.tsx for the per-report permission gate.
 * "reports.view" gates entry to the hub itself; a role that's missing a
 * report's own extra permission (e.g. checklists.view_reports) still sees
 * the row here and gets a clear LockedSection instead of an empty table
 * once it opens that report.
 */
export default async function ReportsPage() {
  await requirePermission("reports.view");

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <SectionCard flush>
        <div className="divide-y divide-line">
          {REPORT_TYPES.map((report) => (
            <ListRow
              key={report.slug}
              title={report.label}
              description={report.description}
              icon={report.icon}
              iconTone={report.iconTone}
              href={`/reports/${report.slug}`}
            />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
