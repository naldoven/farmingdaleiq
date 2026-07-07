import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecordAuditButtons } from "@/components/training/record-audit-buttons";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeAverage } from "@/app/(app)/ratings/logic";

/**
 * /training/graduates — Graduates list and 30-day audits (PASS / PIP).
 * ARCHITECTURE.md "Trainee lifecycle" > "Graduation".
 */
export default async function GraduatesPage() {
  await requirePermission("training.view");
  const canManage = await hasPermission("training.manage");

  const supabase = await createClient();

  const [{ data: enrollments }, { data: audits }, { data: progress }] = await Promise.all([
    supabase
      .from("trainee_enrollments")
      .select("id, user_id, roadmap_id, started_on, graduated_on, status, profiles(name), onboarding_roadmaps(side, name)")
      .in("status", ["graduated", "pip"])
      .order("graduated_on", { ascending: false }),
    supabase.from("graduation_audits").select("id, enrollment_id, due_on, result, notes"),
    supabase.from("station_progress").select("enrollment_id, score"),
  ]);

  const auditByEnrollment = new Map((audits ?? []).map((a) => [a.enrollment_id, a]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Graduates</h1>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Avg score</TableHead>
                <TableHead>Audit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(enrollments ?? []).map((e) => {
                const name = (e.profiles as unknown as { name: string } | null)?.name ?? "Unknown";
                const side = (e.onboarding_roadmaps as unknown as { side: string } | null)?.side ?? "—";
                const scores = (progress ?? [])
                  .filter((p) => p.enrollment_id === e.id && p.score !== null)
                  .map((p) => p.score as number);
                const avg = computeAverage(scores);
                const durationDays =
                  e.graduated_on && e.started_on
                    ? Math.round(
                        (new Date(e.graduated_on).getTime() - new Date(e.started_on).getTime()) / (1000 * 60 * 60 * 24),
                      )
                    : null;
                const audit = auditByEnrollment.get(e.id);

                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell className="capitalize">{side}</TableCell>
                    <TableCell>{e.started_on}</TableCell>
                    <TableCell>{e.graduated_on ?? "—"}</TableCell>
                    <TableCell>{durationDays !== null ? `${durationDays}d` : "—"}</TableCell>
                    <TableCell>{avg !== null ? avg.toFixed(1) : "—"}</TableCell>
                    <TableCell>
                      {!audit ? (
                        <span className="text-muted-foreground">—</span>
                      ) : audit.result ? (
                        <Badge variant={audit.result === "pass" ? "success" : "outline"}>
                          {audit.result.toUpperCase()}
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Due {audit.due_on}</Badge>
                          {canManage && <RecordAuditButtons auditId={audit.id} />}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(enrollments ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No graduates yet.
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
