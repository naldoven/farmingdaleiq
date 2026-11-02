import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { GuestRecoveryReport } from "@/app/(app)/guest-recovery/stats";
import { HScroll, ProgressBar, SectionCard, StatTile } from "@/components/mobile";
import { cn } from "@/lib/utils";

/**
 * Presentational pieces for /guest-recovery/reporting. Aggregate only: no
 * guest names, emails or phones are ever passed in here.
 */

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1] ?? month} ${y}`;
}

function shortMonth(month: string): string {
  return (MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month).slice(0, 3);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

function sendTime(minutes: number | null): string {
  if (minutes === null) return "None yet";
  if (minutes < 1) return "Under 1 min";
  if (minutes < 90) return `${minutes} min`;
  return `${Math.round(minutes / 60)} hr`;
}

function pickupTime(days: number | null): string {
  if (days === null) return "None yet";
  if (days < 1) return "Same day";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function MonthSwitcher({
  month,
  prevHref,
  nextHref,
}: {
  month: string;
  prevHref: string;
  nextHref: string | null;
}) {
  const arrow = "inline-flex h-11 w-11 items-center justify-center rounded-full border border-line bg-card text-ink";
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href={prevHref} aria-label="Previous month" className={arrow}>
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </Link>
      <h2 className="text-[19px] font-semibold text-ink">{monthTitle(month)}</h2>
      {nextHref ? (
        <Link href={nextHref} aria-label="Next month" className={arrow}>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(arrow, "opacity-40")}>
          <ChevronRight className="h-5 w-5" />
        </span>
      )}
    </div>
  );
}

function BarList({
  rows,
  empty,
  tone = "accent",
}: {
  rows: { label: string; count: number; note?: string }[];
  empty: string;
  tone?: "accent" | "success" | "warning" | "danger";
}) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  if (rows.length === 0 || max === 0) {
    return <p className="text-[15px] text-muted-ink">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-[15px]">
            <span className="min-w-0 truncate text-ink">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{r.note ?? r.count}</span>
          </div>
          <ProgressBar value={(r.count / max) * 100} showLabel={false} tone={tone} />
        </li>
      ))}
    </ul>
  );
}

function FollowLine({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="text-[15px] text-ink">{label}</span>
      <span className={cn("text-[15px] font-semibold tabular-nums", tone === "danger" ? "text-danger" : "text-ink")}>
        {value}
      </span>
    </li>
  );
}

export function ReportingView({
  report,
  prevHref,
  nextHref,
}: {
  report: GuestRecoveryReport;
  prevHref: string;
  nextHref: string | null;
}) {
  const f = report.followThrough;
  const sent = f.sendable - f.notSent;
  const delta = report.recoveries - report.lastMonthRecoveries;
  const compare =
    report.lastMonthRecoveries === 0 && report.recoveries === 0
      ? null
      : delta === 0
        ? "Same as last month."
        : `${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} than last month.`;

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-bold leading-tight text-ink">Guest recovery</h1>
        <p className="text-[15px] text-muted-ink">Totals only. No guest details on this screen.</p>
      </div>

      <MonthSwitcher month={report.month} prevHref={prevHref} nextHref={nextHref} />

      <HScroll>
        <StatTile className="w-36" value={report.recoveries} label="Recoveries" />
        <StatTile
          className="w-36"
          value={report.pickedUpPct === null ? "None yet" : `${report.pickedUpPct}%`}
          label="Picked up"
          tone={report.pickedUpPct !== null && report.pickedUpPct >= 80 ? "success" : "neutral"}
        />
        <StatTile
          className="w-36"
          value={report.stillOwed}
          label="Still owed"
          tone={report.stillOwed > 0 ? "warning" : "neutral"}
        />
        <StatTile className="w-36" value={report.voided} label="Voided" />
        <StatTile className="w-36" value={sendTime(report.typicalSendMinutes)} label="Typical time to send" />
        <StatTile className="w-36" value={pickupTime(report.typicalPickupDays)} label="Typical time to pick up" />
      </HScroll>
      {compare ? <p className="text-[13px] text-muted-ink">{compare}</p> : null}

      <SectionCard title="Recoveries by month">
        <BarList
          rows={report.byMonth.map((m) => ({ label: shortMonth(m.month), count: m.count }))}
          empty="Nothing logged in the last 6 months."
        />
      </SectionCard>

      <SectionCard title="What is going missing">
        {report.totalRecoveries > 0 ? (
          <p className="mb-3 text-[13px] text-muted-ink">
            Number of recoveries each item showed up in, out of {report.totalRecoveries}.
          </p>
        ) : null}
        <BarList
          rows={report.missingItems.map((i) => ({
            label: i.family,
            count: i.recoveries,
            note: `${i.recoveries} of ${report.totalRecoveries}`,
          }))}
          empty="No recoveries this month."
          tone="warning"
        />
      </SectionCard>

      <SectionCard title="When it happens">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <h4 className="text-[13px] font-semibold uppercase tracking-wide text-muted-ink">Time of day</h4>
            <BarList
              rows={report.byDaypart.map((d) => ({ label: d.name, count: d.count }))}
              empty="No recoveries this month."
            />
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="text-[13px] font-semibold uppercase tracking-wide text-muted-ink">Day of week</h4>
            <BarList
              rows={report.byWeekday.map((d) => ({ label: d.day, count: d.count }))}
              empty="No recoveries this month."
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Who logged">
        <BarList
          rows={report.loggedBy.map((l) => ({ label: l.name, count: l.count }))}
          empty="No recoveries this month."
          tone="success"
        />
      </SectionCard>

      <SectionCard title="Follow-through">
        {f.owedOverSevenDays > 0 ? (
          <p
            role="status"
            className="mb-3 rounded-xl bg-danger-soft px-3 py-3 text-[15px] font-semibold text-danger"
          >
            {f.owedOverSevenDays} {plural(f.owedOverSevenDays, "guest is", "guests are")} still owed from over a
            week ago. Worth a follow-up call.
          </p>
        ) : null}
        {f.sendable === 0 ? (
          <p className="text-[15px] text-muted-ink">Nothing to follow up this month.</p>
        ) : (
          <ul className="flex flex-col">
            <FollowLine label="Guests who got a message" value={`${sent} of ${f.sendable}`} />
            <FollowLine label={`Sent within 15 minutes`} value={`${f.sentWithin15Min} of ${f.sendable}`} />
            <FollowLine label="Emailed" value={String(f.emailed)} />
            <FollowLine label="Texted" value={String(f.texted)} />
            <FollowLine
              label="Never sent"
              value={String(f.notSent)}
              tone={f.notSent > 0 ? "danger" : undefined}
            />
            <FollowLine label="Still owed this month" value={String(f.stillOwed)} />
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
