import Link from "next/link";

import { BreakBoard } from "@/components/breaks/break-board";
import { HScroll, SectionCard, StatTile } from "@/components/mobile";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { computeBreakDueAt, entitledMinutesForKind } from "@/lib/breaks/entitlement";
import { createClient } from "@/lib/supabase/server";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * /breaks — ARCHITECTURE.md page map: "Break manager: today's entitlements,
 * sequence, authorize/start/complete, overdue alerts." Scoped to one setup
 * (date + day-part) at a time, same framing as /setups, since breaks are
 * generated per posted setup.
 */
export const metadata = { title: "Breaks" };

export default async function BreaksPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; dayPartId?: string }>;
}) {
  await requirePermission("breaks.view");
  const canManage = await hasPermission("breaks.manage");
  const { date, dayPartId } = await searchParams;
  const selectedDate = date ?? todayIso();

  const supabase = await createClient();

  const { data: dayParts } = await supabase
    .from("day_parts")
    .select("id, name")
    .order("sort");

  const selectedDayPartId = dayPartId ?? dayParts?.[0]?.id ?? "";

  let setupQuery = supabase.from("setups").select("id").eq("date", selectedDate);
  setupQuery = selectedDayPartId
    ? setupQuery.eq("day_part_id", selectedDayPartId)
    : setupQuery.is("day_part_id", null);
  const { data: setup } = await setupQuery.maybeSingle();

  const { data: breaks } = setup
    ? await supabase
        .from("breaks")
        .select("id, user_id, kind, status, sequence, rule_id, authorized_at, started_at, ended_at")
        .eq("setup_id", setup.id)
    : { data: [] };

  const userIds = [...new Set((breaks ?? []).map((b) => b.user_id).filter(Boolean))] as string[];
  const { data: profiles } =
    userIds.length > 0
      ? await supabase.from("profiles").select("id, name").in("id", userIds)
      : { data: [] };

  // MED/LOW parity-audit fixes: real breakDueAt (so "Needs Break" fires for a
  // pending-but-due break instead of never), entitled minutes per row (were
  // computed at plan time then discarded), and the authorization-to-start
  // lag (recorded but never surfaced). Needs each break's assignee's arrival
  // time and the break_rules row it was planned against.
  const { data: assignments } = setup
    ? await supabase.from("setup_assignments").select("user_id, arrival_time").eq("setup_id", setup.id)
    : { data: [] };
  const arrivalByUser = new Map(
    (assignments ?? []).filter((a) => a.user_id).map((a) => [a.user_id as string, a.arrival_time]),
  );

  const ruleIds = [...new Set((breaks ?? []).map((b) => b.rule_id).filter(Boolean))] as string[];
  const { data: rules } =
    ruleIds.length > 0
      ? await supabase
          .from("break_rules")
          .select("id, min_shift_minutes, rest_minutes_paid, meal_minutes_unpaid")
          .in("id", ruleIds)
      : { data: [] };
  const ruleById = new Map((rules ?? []).map((r) => [r.id, r]));

  const breakRows = (breaks ?? []).map((b) => {
    const rule = b.rule_id ? (ruleById.get(b.rule_id) ?? null) : null;
    const arrivalIso = b.user_id ? (arrivalByUser.get(b.user_id) ?? null) : null;
    return {
      ...b,
      breakDueAt: computeBreakDueAt(arrivalIso ? new Date(arrivalIso) : null, rule)?.toISOString() ?? null,
      entitledMinutes: entitledMinutesForKind(rule, b.kind),
    };
  });

  const CLOSED_STATUSES = new Set(["completed", "missed"]);
  const remainingCount = breakRows.filter((b) => !CLOSED_STATUSES.has(b.status)).length;
  const completedCount = breakRows.filter((b) => b.status === "completed").length;
  const overdueCount = breakRows.filter((b) => b.status === "overdue").length;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/breaks/report"
          className="inline-flex shrink-0 items-center rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-semibold text-muted-ink hover:bg-secondary"
        >
          Compliance report
        </Link>
        <Link
          href="/setups"
          className="inline-flex shrink-0 items-center rounded-full border border-line bg-card px-3.5 py-1.5 text-[13px] font-semibold text-muted-ink hover:bg-secondary"
        >
          Setup board
        </Link>
      </div>

      <HScroll>
        <StatTile value={remainingCount} label="Remaining" tone="warning" />
        <StatTile value={completedCount} label="Completed" tone="success" />
        <StatTile value={overdueCount} label="Overdue" tone={overdueCount > 0 ? "danger" : "neutral"} />
      </HScroll>

      <SectionCard title="Day / shift">
        <form className="flex flex-wrap items-center gap-2" method="get">
          <input
            type="date"
            name="date"
            defaultValue={selectedDate}
            className="h-10 rounded-lg border border-line bg-card px-3 text-[15px] text-ink"
          />
          <select
            name="dayPartId"
            defaultValue={selectedDayPartId}
            className="h-10 rounded-lg border border-line bg-card px-3 text-[15px] text-ink"
          >
            {(dayParts ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-[15px] font-semibold text-white"
          >
            View
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Break sequence" flush>
        <BreakBoard
          setupId={setup?.id ?? null}
          canManage={canManage}
          breaks={breakRows}
          profiles={profiles ?? []}
        />
      </SectionCard>
    </div>
  );
}
