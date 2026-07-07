import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EnrollTraineeForm } from "@/components/training/enroll-trainee-form";
import { StationCell } from "@/components/training/station-cell";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { completedCount, phaseAverage } from "@/app/(app)/training/grid/logic";
import { computeAverage } from "@/app/(app)/ratings/logic";

/**
 * /training/grid — Station grid: trainees by stations, click-to-cycle and
 * score, phase averages. ARCHITECTURE.md "Trainee lifecycle" > "Station
 * grid".
 */
export default async function StationGridPage({
  searchParams,
}: {
  searchParams: Promise<{ roadmap?: string }>;
}) {
  await requirePermission("training.view");
  const canScore = await hasPermission("training.stamp");
  const canManage = await hasPermission("training.manage");
  const { roadmap: roadmapParam } = await searchParams;

  const supabase = await createClient();

  const { data: roadmaps } = await supabase
    .from("onboarding_roadmaps")
    .select("id, name, side, active")
    .order("side");

  const activeRoadmap =
    (roadmaps ?? []).find((r) => r.id === roadmapParam) ??
    (roadmaps ?? []).find((r) => r.active) ??
    (roadmaps ?? [])[0];

  if (!activeRoadmap) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Station Grid</h1>
        <p className="mt-2 text-sm text-muted-foreground">No onboarding roadmaps yet.</p>
      </div>
    );
  }

  const [{ data: stations }, { data: enrollments }, { data: progress }, { data: people }] = await Promise.all([
    supabase
      .from("roadmap_stations")
      .select("id, position_id, phase, sort, positions(name)")
      .eq("roadmap_id", activeRoadmap.id)
      .order("sort"),
    supabase
      .from("trainee_enrollments")
      .select("id, user_id, status, profiles(name)")
      .eq("roadmap_id", activeRoadmap.id)
      .eq("status", "active"),
    supabase.from("station_progress").select("enrollment_id, roadmap_station_id, status, score"),
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
  ]);

  const stationList = stations ?? [];
  const phases = Array.from(new Set(stationList.map((s) => s.phase)));
  const progressByKey = new Map(
    (progress ?? []).map((p) => [`${p.enrollment_id}:${p.roadmap_station_id}`, p]),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Station Grid</h1>
        <div className="flex gap-2">
          {(roadmaps ?? []).map((r) => (
            <a
              key={r.id}
              href={`/training/grid?roadmap=${r.id}`}
              className={`rounded-md px-2 py-1 text-sm ${r.id === activeRoadmap.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {r.name}
            </a>
          ))}
        </div>
      </div>

      {canManage && <EnrollTraineeForm roadmapId={activeRoadmap.id} people={people ?? []} />}

      <Card>
        <CardHeader>
          <CardTitle>{activeRoadmap.name}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card">Trainee</TableHead>
                {phases.map((phase) => (
                  <TableHead
                    key={phase}
                    colSpan={stationList.filter((s) => s.phase === phase).length}
                    className="text-center"
                  >
                    {phase}
                  </TableHead>
                ))}
                <TableHead className="text-center">Overall</TableHead>
                <TableHead className="text-center">Done</TableHead>
              </TableRow>
              <TableRow>
                <TableHead className="sticky left-0 bg-card" />
                {stationList.map((station) => (
                  <TableHead key={station.id} className="whitespace-nowrap text-center text-xs">
                    {(station.positions as unknown as { name: string } | null)?.name ?? "—"}
                  </TableHead>
                ))}
                <TableHead />
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(enrollments ?? []).map((enrollment) => {
                const scores = stationList.map(
                  (s) => progressByKey.get(`${enrollment.id}:${s.id}`)?.score ?? null,
                );
                const statuses = stationList.map(
                  (s) => progressByKey.get(`${enrollment.id}:${s.id}`)?.status ?? "not_started",
                );
                const overall = computeAverage(scores.filter((s): s is number => s !== null));
                const done = completedCount(statuses as ("not_started" | "in_training" | "scored")[]);

                return (
                  <TableRow key={enrollment.id}>
                    <TableCell className="sticky left-0 whitespace-nowrap bg-card font-medium">
                      {(enrollment.profiles as unknown as { name: string } | null)?.name ?? "Unknown"}
                    </TableCell>
                    {stationList.map((station) => {
                      const cell = progressByKey.get(`${enrollment.id}:${station.id}`);
                      return (
                        <TableCell key={station.id} className="text-center">
                          <StationCell
                            enrollmentId={enrollment.id}
                            roadmapStationId={station.id}
                            status={cell?.status ?? "not_started"}
                            score={cell?.score ?? null}
                            canScore={canScore}
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-center">
                      <Badge variant="outline">{overall !== null ? overall.toFixed(1) : "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {done}/{stationList.length}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(enrollments ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={stationList.length + 3} className="text-center text-muted-foreground">
                    No active trainees on this roadmap.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        {phases.map((phase) => {
          const phaseStationIds = new Set(stationList.filter((s) => s.phase === phase).map((s) => s.id));
          const allPhaseScores = (enrollments ?? []).flatMap((e) =>
            stationList
              .filter((s) => phaseStationIds.has(s.id))
              .map((s) => progressByKey.get(`${e.id}:${s.id}`)?.score ?? null),
          );
          const avg = phaseAverage(allPhaseScores);
          return (
            <Badge key={phase} variant="outline">
              {phase} avg: {avg !== null ? avg.toFixed(1) : "—"}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
