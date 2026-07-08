import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HScroll, SectionCard, StatTile } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";
import { groupBreakComplianceByKey, summarizeBreakCompliance } from "@/lib/breaks/compliance";
import { createClient } from "@/lib/supabase/server";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * /breaks/report — the break compliance report ARCHITECTURE.md calls for
 * ("a compliance report shows pending, completed, overdue, and missed
 * breaks over any date range") and the HIGH parity-audit finding that it
 * didn't exist anywhere. Lives under /breaks (this stream's own route tree)
 * rather than /reports (owned by the Reporting stream) since app/(app)/
 * reports/** is outside this stream's ownership.
 */
export default async function BreaksReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requirePermission("breaks.view");
  const { from, to } = await searchParams;
  const rangeFrom = from ?? daysAgoIso(6);
  const rangeTo = to ?? todayIso();

  const supabase = await createClient();

  const { data: setups } = await supabase
    .from("setups")
    .select("id, date")
    .gte("date", rangeFrom)
    .lte("date", rangeTo);

  const dateBySetupId = new Map((setups ?? []).map((s) => [s.id, s.date]));
  const setupIds = (setups ?? []).map((s) => s.id);

  const { data: breaks } =
    setupIds.length > 0
      ? await supabase.from("breaks").select("setup_id, status").in("setup_id", setupIds)
      : { data: [] };

  const rows = (breaks ?? []).map((b) => ({
    status: b.status,
    date: b.setup_id ? (dateBySetupId.get(b.setup_id) ?? "unknown") : "unknown",
  }));

  const overall = summarizeBreakCompliance(rows);
  const byDay = groupBreakComplianceByKey(rows, (r) => r.date);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <SectionCard title="Date range">
        <form className="flex flex-wrap items-center gap-2" method="get">
          <input
            type="date"
            name="from"
            defaultValue={rangeFrom}
            className="h-10 rounded-lg border border-line bg-card px-3 text-[15px] text-ink"
          />
          <span className="text-[13px] text-muted-ink">to</span>
          <input
            type="date"
            name="to"
            defaultValue={rangeTo}
            className="h-10 rounded-lg border border-line bg-card px-3 text-[15px] text-ink"
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-[15px] font-semibold text-white"
          >
            View
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Totals" action={<span className="text-[13px] text-muted-ink">{rangeFrom} – {rangeTo}</span>}>
        <HScroll>
          <StatTile value={overall.pending} label="Pending" />
          <StatTile value={overall.authorized} label="Authorized" />
          <StatTile value={overall.active} label="Active" tone="warning" />
          <StatTile value={overall.completed} label="Completed" tone="success" />
          <StatTile value={overall.overdue} label="Overdue" tone={overall.overdue > 0 ? "danger" : "neutral"} />
          <StatTile value={overall.missed} label="Missed" tone={overall.missed > 0 ? "danger" : "neutral"} />
          <StatTile value={overall.total} label="Total" />
        </HScroll>
      </SectionCard>

      <SectionCard title="By day">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Pending</TableHead>
              <TableHead>Authorized</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Completed</TableHead>
              <TableHead>Overdue</TableHead>
              <TableHead>Missed</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byDay.map(({ key, summary }) => (
              <TableRow key={key}>
                <TableCell>{key}</TableCell>
                <TableCell>{summary.pending}</TableCell>
                <TableCell>{summary.authorized}</TableCell>
                <TableCell>{summary.active}</TableCell>
                <TableCell>{summary.completed}</TableCell>
                <TableCell className={summary.overdue > 0 ? "text-danger" : undefined}>
                  {summary.overdue}
                </TableCell>
                <TableCell className={summary.missed > 0 ? "text-danger" : undefined}>
                  {summary.missed}
                </TableCell>
                <TableCell>{summary.total}</TableCell>
              </TableRow>
            ))}
            {byDay.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-ink">
                  No breaks in this date range.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}
