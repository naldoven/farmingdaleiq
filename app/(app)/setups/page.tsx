import Link from "next/link";
import { Settings } from "lucide-react";

import { SectionCard } from "@/components/mobile";
import { SetupBoard } from "@/components/setups/setup-board";
import { SetupFilters } from "@/components/setups/setup-filters";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { computeBreakDueAt } from "@/lib/breaks/entitlement";
import { loadTraineeUserIds } from "@/lib/integration/people-badges";
import { loadPositionSuitability, type PositionSuitability } from "@/lib/integration/position-ratings";
import { createClient } from "@/lib/supabase/server";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * /setups — ARCHITECTURE.md page map: "Setup board (visual layout or list)
 * by date/day-part; auto-place suggestions; create/assign/post; shift
 * notes." Both the list view and the live posted board (layout canvas) are
 * available here (MED parity-audit fix: the canvas used to exist only under
 * /setups/templates, showing bare position tiles, never a real posted
 * board's assignments/badges/break state).
 *
 * KitchenIQ mobile redesign (docs/DESIGN-SYSTEM.md): date/day-part chips up
 * top, the board itself as white rounded cards. Visual/layout only — every
 * query, permission check, and server action below is unchanged from the
 * pre-redesign page.
 */
export const metadata = { title: "Setups" };

export default async function SetupsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; dayPartId?: string; view?: string }>;
}) {
  await requirePermission("setups.view");
  const canManage = await hasPermission("setups.manage");
  const canPost = await hasPermission("setups.post");
  const { date, dayPartId, view } = await searchParams;
  const selectedDate = date ?? todayIso();
  const rosterView = view === "hourly" ? "hourly" : "full-day";

  const supabase = await createClient();

  const [{ data: dayParts }, { data: templates }, { data: positions }, { data: roles }] = await Promise.all([
    supabase.from("day_parts").select("id, name, start_time, end_time").order("sort"),
    supabase.from("setup_templates").select("id, name, day_part_id"),
    supabase.from("positions").select("id, name"),
    supabase.from("roles").select("id, rank"),
  ]);

  const selectedDayPartId = dayPartId ?? dayParts?.[0]?.id ?? "";
  const templatesForDayPart = (templates ?? []).filter(
    (t) => !selectedDayPartId || t.day_part_id === selectedDayPartId,
  );

  let setupQuery = supabase
    .from("setups")
    .select("id, posted_at, template_id")
    .eq("date", selectedDate);
  setupQuery = selectedDayPartId
    ? setupQuery.eq("day_part_id", selectedDayPartId)
    : setupQuery.is("day_part_id", null);
  const { data: setup } = await setupQuery.maybeSingle();

  const { data: assignments } = setup
    ? await supabase
        .from("setup_assignments")
        .select("id, position_id, user_id, arrival_time")
        .eq("setup_id", setup.id)
    : { data: [] };

  const { data: activeProfiles } = await supabase
    .from("profiles")
    .select("id, name, role_id, birthdate, hired_on, active")
    .eq("active", true)
    .order("name");

  // P2 wiring (S3 -> S4): real Trainee badge on the board.
  const traineeUserIds = await loadTraineeUserIds(
    supabase,
    (activeProfiles ?? []).map((p) => p.id),
  );

  const { data: breaks } = setup
    ? await supabase.from("breaks").select("user_id, status, authorized_at, rule_id").eq("setup_id", setup.id)
    : { data: [] };

  // MED parity-audit fix: real breakDueAt for the "Needs Break" badge (was
  // hardcoded null on this board). Needs each break's rule (for
  // min_shift_minutes) joined with the assignee's arrival time.
  const breakRuleIds = [...new Set((breaks ?? []).map((b) => b.rule_id).filter(Boolean))] as string[];
  const { data: breakRules } =
    breakRuleIds.length > 0
      ? await supabase.from("break_rules").select("id, min_shift_minutes").in("id", breakRuleIds)
      : { data: [] };
  const breakRuleById = new Map((breakRules ?? []).map((r) => [r.id, r]));
  const arrivalByUser = new Map(
    (assignments ?? []).filter((a) => a.user_id).map((a) => [a.user_id as string, a.arrival_time]),
  );
  const breakDueAtByUser = new Map<string, Date | null>();
  for (const b of breaks ?? []) {
    if (!b.user_id) continue;
    const rule = b.rule_id ? (breakRuleById.get(b.rule_id) ?? null) : null;
    const arrivalIso = arrivalByUser.get(b.user_id) ?? null;
    breakDueAtByUser.set(b.user_id, computeBreakDueAt(arrivalIso ? new Date(arrivalIso) : null, rule));
  }

  // LOW parity-audit fix: compute the under-qualified suitability for every
  // ALREADY-assigned position on render, instead of only after a leader
  // clicks Suggest. One suitability lookup per assigned position (small,
  // bounded by the number of positions on a setup).
  const suitabilityByAssignment = new Map<string, PositionSuitability>();
  for (const assignment of assignments ?? []) {
    if (!assignment.user_id || !assignment.position_id) continue;
    const suitability = await loadPositionSuitability(supabase, [assignment.user_id], assignment.position_id);
    const found = suitability.get(assignment.user_id);
    if (found) suitabilityByAssignment.set(assignment.id, found);
  }

  const { data: shiftNotes } = setup
    ? await supabase
        .from("shift_notes")
        .select("id, author_id, body, created_at")
        .eq("setup_id", setup.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  let topPerformerSelected = false;
  if (setup) {
    // app_events is no longer directly readable by the authenticated client
    // (FIQ-02): this narrow SECURITY DEFINER function answers just the
    // "already picked?" question without exposing event payloads.
    const { data: picked } = await supabase.rpc("setup_has_top_performer", {
      p_setup_id: setup.id,
    });
    topPerformerSelected = picked === true;
  }

  // Roster view (ARCHITECTURE.md: "roster view (full-day or hourly)"):
  // every day-part's setup status for this date, at a glance.
  const { data: dayRoster } = await supabase
    .from("setups")
    .select("day_part_id, posted_at")
    .eq("date", selectedDate);
  const rosterByDayPart = new Map((dayRoster ?? []).map((s) => [s.day_part_id, s.posted_at]));

  // LOW parity-audit fix: hourly roster view alongside the existing full-day
  // one. Buckets the selected day-part's hours and lists who has arrived by
  // the start of each hour (arrival_time, falling back to the day-part
  // start for anyone with no recorded arrival yet).
  const selectedDayPart = dayParts?.find((d) => d.id === selectedDayPartId) ?? null;
  const hourlyBuckets: { hour: string; names: string[] }[] = [];
  if (selectedDayPart) {
    const [startHour] = selectedDayPart.start_time.split(":").map(Number);
    const [endHour, endMinute] = selectedDayPart.end_time.split(":").map(Number);
    const lastHour = endMinute > 0 ? endHour : endHour - 1;
    const profileNameById = new Map((activeProfiles ?? []).map((p) => [p.id, p.name]));
    for (let hour = startHour; hour <= lastHour; hour += 1) {
      const names = (assignments ?? [])
        .filter((a) => {
          if (!a.user_id) return false;
          const arrivalHour = a.arrival_time ? new Date(a.arrival_time).getHours() : startHour;
          return arrivalHour <= hour;
        })
        .map((a) => profileNameById.get(a.user_id as string) ?? "Unknown");
      hourlyBuckets.push({ hour: `${hour.toString().padStart(2, "0")}:00`, names });
    }
  }

  // MED parity-audit fix: render the live posted board on the layout canvas
  // (previously the canvas only existed under /setups/templates and never
  // showed assigned people/badges/break state). Picks the active layout
  // scoped to this day-part, falling back to an active any-day-part layout.
  const { data: activeLayouts } = await supabase
    .from("store_layouts")
    .select("id, name, day_part_id")
    .eq("active", true);
  const activeLayout =
    (activeLayouts ?? []).find((l) => l.day_part_id === selectedDayPartId) ??
    (activeLayouts ?? []).find((l) => !l.day_part_id) ??
    null;
  const { data: layoutTiles } = activeLayout
    ? await supabase
        .from("layout_tiles")
        .select("id, position_id, x, y, w, h, area_label")
        .eq("layout_id", activeLayout.id)
    : { data: [] };

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          <Link
            href="/setups/templates"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Templates &amp; layout
          </Link>
        </div>
      )}

      <SetupFilters
        dayParts={(dayParts ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          posted: Boolean(rosterByDayPart.get(d.id)),
          exists: rosterByDayPart.has(d.id),
        }))}
        selectedDate={selectedDate}
        selectedDayPartId={selectedDayPartId}
        rosterView={rosterView}
      />

      {rosterView === "hourly" && (
        <SectionCard title={`Hourly roster — ${selectedDayPart?.name ?? "shift"}`}>
          {hourlyBuckets.length === 0 ? (
            <p className="text-[13px] text-muted-ink">No day-part selected.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {hourlyBuckets.map((bucket) => (
                <li key={bucket.hour} className="flex gap-3 text-[13px]">
                  <span className="w-14 shrink-0 font-semibold text-ink">{bucket.hour}</span>
                  <span className="text-muted-ink">
                    {bucket.names.length > 0 ? bucket.names.join(", ") : "Nobody yet"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      <SetupBoard
        date={selectedDate}
        dayPartId={selectedDayPartId}
        dayPartName={selectedDayPart?.name ?? "Shift"}
        setup={setup ?? null}
        assignments={assignments ?? []}
        positions={positions ?? []}
        profiles={activeProfiles ?? []}
        roles={roles ?? []}
        templates={templatesForDayPart}
        breakStatuses={breaks ?? []}
        breakDueAtByUser={[...breakDueAtByUser.entries()].map(([userId, dueAt]) => [
          userId,
          dueAt?.toISOString() ?? null,
        ])}
        traineeUserIds={[...traineeUserIds]}
        shiftNotes={shiftNotes ?? []}
        canManage={canManage}
        canPost={canPost}
        topPerformerSelected={topPerformerSelected}
        suitabilityByAssignment={[...suitabilityByAssignment.entries()]}
        layout={activeLayout}
        layoutTiles={layoutTiles ?? []}
      />
    </div>
  );
}
