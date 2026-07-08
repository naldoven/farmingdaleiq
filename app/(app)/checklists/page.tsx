import Link from "next/link";
import { Settings } from "lucide-react";

import { ListRow, SectionCard } from "@/components/mobile";
import { ChecklistList, type ChecklistRunItem, type RunStatus } from "@/components/checklists/checklist-list";
import { FollowUpResolveButton } from "@/components/checklists/follow-up-resolve-button";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/** Round gear link to /checklists/templates, the sub-page header's "gear" action rendered in page content (the shared AppHeader has no page-level action slot). */
function ManageTemplatesLink() {
  return (
    <Link
      href="/checklists/templates"
      aria-label="Manage checklist templates"
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-ink transition-colors hover:bg-line"
    >
      <Settings className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

/**
 * /checklists -- ARCHITECTURE.md page map: "Today's runs to complete; run
 * player UI." Shows runs materialized for today (by the nightly job, see
 * app/api/cron/checklists/route.ts) plus open follow-ups. Restyled onto the
 * KitchenIQ mobile design system (docs/DESIGN-SYSTEM.md): the mine/all filter
 * that used to be a `?filter=mine` server round-trip is now an instant client
 * FilterChip over the same fetched rows, same permission gate.
 */
export default async function ChecklistsPage() {
  await requirePermission("checklists.complete");
  const canManageTemplates = await hasPermission("checklists.manage_templates");

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: runs },
    { data: templates },
    { data: dayParts },
    { data: teams },
    { data: members },
    { data: followUps },
  ] = await Promise.all([
    supabase
      .from("checklist_runs")
      .select(
        "id, template_id, day_part_id, status, assigned_user_id, assigned_position_id, assigned_team_id, run_date",
      )
      .eq("run_date", today),
    supabase.from("checklist_templates").select("id, name"),
    supabase.from("day_parts").select("id, name"),
    supabase.from("teams").select("id, name"),
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
    supabase
      .from("follow_ups")
      .select("id, description, status, due_at, assigned_to")
      .neq("status", "resolved"),
  ]);

  const templateNameById = new Map((templates ?? []).map((t) => [t.id, t.name]));
  const dayPartNameById = new Map((dayParts ?? []).map((d) => [d.id, d.name]));
  const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const memberNameById = new Map((members ?? []).map((m) => [m.id, m.name]));

  function assignmentLabel(run: {
    assigned_user_id: string | null;
    assigned_team_id: string | null;
  }): string {
    if (run.assigned_user_id) return memberNameById.get(run.assigned_user_id) ?? "Assigned";
    if (run.assigned_team_id) return `Team: ${teamNameById.get(run.assigned_team_id) ?? "—"}`;
    return "Unassigned";
  }

  const sortedRuns = [...(runs ?? [])].sort((a, b) => {
    if (a.status === b.status) return 0;
    if (a.status === "completed") return 1;
    if (b.status === "completed") return -1;
    return 0;
  });

  const runItems: ChecklistRunItem[] = sortedRuns.map((run) => ({
    id: run.id,
    templateName: templateNameById.get(run.template_id) ?? "Checklist",
    dayPartName: run.day_part_id ? (dayPartNameById.get(run.day_part_id) ?? null) : null,
    status: run.status as RunStatus,
    assignedUserId: run.assigned_user_id,
    assignmentLabel: assignmentLabel(run),
    canReassign: run.status !== "completed" && run.status !== "missed",
  }));

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      {canManageTemplates && (
        <div className="flex justify-end">
          <ManageTemplatesLink />
        </div>
      )}

      <ChecklistList
        runs={runItems}
        currentUserId={user?.id ?? null}
        canManageTemplates={canManageTemplates}
        members={(members ?? []).map((m) => ({ id: m.id, name: m.name }))}
      />

      <SectionCard title="Open Follow-Ups" flush>
        {(followUps ?? []).length === 0 ? (
          <p className="px-4 pb-4 text-[13px] text-muted-ink">No open follow-ups.</p>
        ) : (
          <div className="divide-y divide-line">
            {(followUps ?? []).map((followUp) => (
              <ListRow
                key={followUp.id}
                title={followUp.description}
                description={
                  followUp.due_at
                    ? `Due ${new Date(followUp.due_at).toLocaleString()} · ${followUp.status.replace("_", " ")}`
                    : `No due date · ${followUp.status.replace("_", " ")}`
                }
                trailing={<FollowUpResolveButton followUpId={followUp.id} />}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
