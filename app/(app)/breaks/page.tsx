import Link from "next/link";

import { BreakBoard } from "@/components/breaks/break-board";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Breaks</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/breaks/report">Compliance report</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/setups">Setup board</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Day / shift</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
            />
            <select
              name="dayPartId"
              defaultValue={selectedDayPartId}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
            >
              {(dayParts ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary">
              View
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Break sequence</CardTitle>
        </CardHeader>
        <CardContent>
          <BreakBoard
            setupId={setup?.id ?? null}
            canManage={canManage}
            breaks={breakRows}
            profiles={profiles ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
