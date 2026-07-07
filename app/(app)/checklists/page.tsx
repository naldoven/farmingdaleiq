import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FollowUpResolveButton } from "@/components/checklists/follow-up-resolve-button";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const STATUS_VARIANT: Record<string, "outline" | "success" | "warning" | "destructive"> = {
  pending: "outline",
  in_progress: "warning",
  completed: "success",
  missed: "destructive",
};

/**
 * /checklists -- ARCHITECTURE.md page map: "Today's runs to complete; run
 * player UI." Shows runs materialized for today (by the nightly job, see
 * app/api/cron/checklists/route.ts) plus open follow-ups.
 */
export default async function ChecklistsPage() {
  await requirePermission("checklists.complete");
  const canManageTemplates = await hasPermission("checklists.manage_templates");

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: runs }, { data: templates }, { data: dayParts }, { data: followUps }] =
    await Promise.all([
      supabase
        .from("checklist_runs")
        .select("id, template_id, day_part_id, status, assigned_user_id, assigned_position_id, run_date")
        .eq("run_date", today),
      supabase.from("checklist_templates").select("id, name"),
      supabase.from("day_parts").select("id, name"),
      supabase
        .from("follow_ups")
        .select("id, description, status, due_at, assigned_to")
        .neq("status", "resolved"),
    ]);

  const templateNameById = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const dayPartNameById = new Map((dayParts ?? []).map((d) => [d.id, d.name]));

  const sortedRuns = [...(runs ?? [])].sort((a, b) => {
    if (a.status === b.status) return 0;
    if (a.status === "completed") return 1;
    if (b.status === "completed") return -1;
    return 0;
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Today&apos;s checklists</h1>
        {canManageTemplates && (
          <Button asChild variant="outline">
            <Link href="/checklists/templates">Manage templates</Link>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Checklist</TableHead>
                <TableHead>Day part</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="font-medium">
                    {templateNameById.get(run.template_id) ?? "Checklist"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {run.day_part_id ? dayPartNameById.get(run.day_part_id) ?? "—" : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[run.status] ?? "outline"}>
                      {run.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button asChild variant={run.status === "completed" ? "outline" : "default"} size="sm">
                      <Link href={`/checklists/${run.id}`}>
                        {run.status === "completed" ? "View" : "Open"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {sortedRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No checklists scheduled for today yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open follow-ups</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(followUps ?? []).map((followUp) => (
            <div
              key={followUp.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
            >
              <div>
                <p className="text-sm font-medium">{followUp.description}</p>
                <p className="text-xs text-muted-foreground">
                  {followUp.due_at ? `Due ${new Date(followUp.due_at).toLocaleString()}` : "No due date"} -{" "}
                  {followUp.status}
                </p>
              </div>
              <FollowUpResolveButton followUpId={followUp.id} />
            </div>
          ))}
          {(followUps ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No open follow-ups.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
