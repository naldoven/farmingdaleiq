import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Break compliance report</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/breaks">Back to breaks</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date range</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <input
              type="date"
              name="from"
              defaultValue={rangeFrom}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              name="to"
              defaultValue={rangeTo}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
            />
            <Button type="submit" variant="secondary">
              View
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Totals — {rangeFrom} to {rangeTo}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">Pending {overall.pending}</Badge>
          <Badge variant="secondary">Authorized {overall.authorized}</Badge>
          <Badge variant="secondary">Active {overall.active}</Badge>
          <Badge variant="success">Completed {overall.completed}</Badge>
          <Badge variant="destructive">Overdue {overall.overdue}</Badge>
          <Badge variant="destructive">Missed {overall.missed}</Badge>
          <Badge variant="outline">Total {overall.total}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By day</CardTitle>
        </CardHeader>
        <CardContent>
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
                  <TableCell>{summary.overdue}</TableCell>
                  <TableCell>{summary.missed}</TableCell>
                  <TableCell>{summary.total}</TableCell>
                </TableRow>
              ))}
              {byDay.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No breaks in this date range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
