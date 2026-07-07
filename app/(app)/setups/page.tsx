import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupBoard } from "@/components/setups/setup-board";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { loadTraineeUserIds } from "@/lib/integration/people-badges";
import { createClient } from "@/lib/supabase/server";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * /setups — ARCHITECTURE.md page map: "Setup board (visual layout or list)
 * by date/day-part; auto-place suggestions; create/assign/post; shift
 * notes." This is the list-view board; the visual canvas lives at
 * /setups/templates's layout editor (ARCHITECTURE.md: "List view remains as
 * a fallback" — kept as the default here since a posted setup's assignments
 * aren't yet tied to layout_tiles positions, only to template positions).
 */
export default async function SetupsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; dayPartId?: string }>;
}) {
  await requirePermission("setups.view");
  const canManage = await hasPermission("setups.manage");
  const canPost = await hasPermission("setups.post");
  const { date, dayPartId } = await searchParams;
  const selectedDate = date ?? todayIso();

  const supabase = await createClient();

  const [{ data: dayParts }, { data: templates }, { data: positions }, { data: roles }] = await Promise.all([
    supabase.from("day_parts").select("id, name").order("sort"),
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
    ? await supabase.from("breaks").select("user_id, status, authorized_at").eq("setup_id", setup.id)
    : { data: [] };

  const { data: shiftNotes } = setup
    ? await supabase
        .from("shift_notes")
        .select("id, author_id, body, created_at")
        .eq("setup_id", setup.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  let topPerformerSelected = false;
  if (setup) {
    const { data: events } = await supabase
      .from("app_events")
      .select("payload")
      .eq("event_key", "top_performer");
    topPerformerSelected = (events ?? []).some((row) => {
      const payload = row.payload as { setup_id?: string } | null;
      return payload?.setup_id === setup.id;
    });
  }

  // Roster view (ARCHITECTURE.md: "roster view (full-day or hourly)"):
  // every day-part's setup status for this date, at a glance.
  const { data: dayRoster } = await supabase
    .from("setups")
    .select("day_part_id, posted_at")
    .eq("date", selectedDate);
  const rosterByDayPart = new Map((dayRoster ?? []).map((s) => [s.day_part_id, s.posted_at]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Setup board</h1>
        {canManage && (
          <Button asChild variant="outline" size="sm">
            <Link href="/setups/templates">Manage templates &amp; layout</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Date / day-part</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
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

          <div className="flex flex-wrap gap-2">
            {(dayParts ?? []).map((d) => {
              const posted = rosterByDayPart.get(d.id);
              const exists = rosterByDayPart.has(d.id);
              return (
                <Link
                  key={d.id}
                  href={`/setups?date=${selectedDate}&dayPartId=${d.id}`}
                  className="no-underline"
                >
                  <Badge variant={posted ? "success" : exists ? "outline" : "secondary"}>
                    {d.name}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {dayParts?.find((d) => d.id === selectedDayPartId)?.name ?? "Shift"} — {selectedDate}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SetupBoard
            date={selectedDate}
            dayPartId={selectedDayPartId}
            setup={setup ?? null}
            assignments={assignments ?? []}
            positions={positions ?? []}
            profiles={activeProfiles ?? []}
            roles={roles ?? []}
            templates={templatesForDayPart}
            breakStatuses={breaks ?? []}
            traineeUserIds={[...traineeUserIds]}
            shiftNotes={shiftNotes ?? []}
            canManage={canManage}
            canPost={canPost}
            topPerformerSelected={topPerformerSelected}
          />
        </CardContent>
      </Card>
    </div>
  );
}
