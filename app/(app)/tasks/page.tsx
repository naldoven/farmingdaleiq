import { TaskBoard } from "@/components/tasks/task-board";
import { type TaskRowView } from "@/components/tasks/task-list";
import { type TaskTemplateRowView } from "@/components/tasks/task-templates-table";
import type { NamedOption } from "@/components/tasks/delegate-task-control";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /tasks — ARCHITECTURE.md "Tasks (To-Dos)" + PLAN.md S2 brief: "My tasks +
 * shift pool; create ad-hoc tasks." KitchenIQ mobile redesign
 * (docs/DESIGN-SYSTEM.md): the sub-page header ("Tasks" + back chevron) comes
 * from the shell via lib/nav/page-map.ts resolveHeader, so this page only
 * renders the FilterChip tabs + SectionCard/ListRow board (components/tasks/
 * task-board.tsx). Reads are gated by tasks.complete, which every seeded role
 * holds (supabase/migrations/20260707001900_seed_store_config.sql base_keys),
 * mirroring the intended RLS reality once tasks/task_templates RLS policies
 * are added (see the stream report: not added here, blocked on the "don't
 * touch migrations" hard boundary). Manage-only sections (create/templates/
 * cancel) check tasks.manage and are enforced for real in the server actions
 * regardless of what this page renders.
 */
export default async function TasksPage() {
  await requirePermission("tasks.complete");
  const canManage = await hasPermission("tasks.manage");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: tasks },
    { data: templates },
    { data: profiles },
    { data: positions },
    { data: dayParts },
  ] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id, kind, title, day_part_id, due_at, assigned_user_id, assigned_position_id, status, token_value",
      )
      .eq("date", today)
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("task_templates")
      .select(
        "id, title, description, frequency, days_of_week, day_part_id, start_time, due_time, assign_user_id, assign_position_id, token_value, active",
      )
      .order("title"),
    supabase.from("profiles").select("id, name, active").eq("active", true).order("name"),
    supabase.from("positions").select("id, name").order("sort"),
    supabase.from("day_parts").select("id, name").order("sort"),
  ]);

  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  const positionNameById = new Map((positions ?? []).map((p) => [p.id, p.name]));
  const dayPartNameById = new Map((dayParts ?? []).map((d) => [d.id, d.name]));

  const userOptions: NamedOption[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name }));
  const positionOptions: NamedOption[] = (positions ?? []).map((p) => ({ id: p.id, name: p.name }));
  const dayPartOptions: NamedOption[] = (dayParts ?? []).map((d) => ({ id: d.id, name: d.name }));

  function toRowView(t: NonNullable<typeof tasks>[number]): TaskRowView {
    return {
      id: t.id,
      title: t.title,
      kind: t.kind,
      dayPartName: t.day_part_id ? (dayPartNameById.get(t.day_part_id) ?? null) : null,
      dueAt: t.due_at,
      status: t.status,
      tokenValue: t.token_value,
    };
  }

  const allTasks = tasks ?? [];
  const mine = allTasks
    .filter((t) => t.assigned_user_id && t.assigned_user_id === userId && t.status !== "cancelled")
    .map(toRowView);
  const pool = allTasks
    .filter(
      (t) => !t.assigned_user_id && (t.status === "pending" || t.status === "overdue"),
    )
    .map(toRowView);
  const allToday = allTasks.map(toRowView);

  const templateRows: TaskTemplateRowView[] = (templates ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    frequency: t.frequency,
    daysOfWeek: t.days_of_week,
    dayPartId: t.day_part_id,
    dayPartName: t.day_part_id ? (dayPartNameById.get(t.day_part_id) ?? null) : null,
    startTime: t.start_time,
    dueTime: t.due_time,
    assignUserId: t.assign_user_id,
    assignPositionId: t.assign_position_id,
    assigneeLabel: t.assign_user_id
      ? (profileNameById.get(t.assign_user_id) ?? null)
      : t.assign_position_id
        ? (positionNameById.get(t.assign_position_id) ?? null)
        : null,
    tokenValue: t.token_value,
    active: t.active,
  }));

  return (
    // Data-heavy screen (forms + templates table on the Manage tab), so this
    // gets the wider desktop column docs/DESIGN-SYSTEM.md allows beyond the
    // 480px dashboard width; mobile is unaffected below md.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <TaskBoard
        mine={mine}
        pool={pool}
        allToday={allToday}
        templates={templateRows}
        canManage={canManage}
        users={userOptions}
        positions={positionOptions}
        dayParts={dayPartOptions}
      />
    </div>
  );
}
