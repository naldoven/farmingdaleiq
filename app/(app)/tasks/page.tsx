import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateTaskForm } from "@/components/tasks/create-task-form";
import { CreateTemplateForm } from "@/components/tasks/create-template-form";
import { TaskList, type TaskRowView } from "@/components/tasks/task-list";
import { TaskTemplatesTable, type TaskTemplateRowView } from "@/components/tasks/task-templates-table";
import type { NamedOption } from "@/components/tasks/delegate-task-control";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /tasks — ARCHITECTURE.md "Tasks (To-Dos)" + PLAN.md S2 brief: "My tasks +
 * shift pool; create ad-hoc tasks." Reads are gated by tasks.complete, which
 * every seeded role holds (supabase/migrations/20260707001900_seed_store_
 * config.sql base_keys), mirroring the intended RLS reality once tasks/
 * task_templates RLS policies are added (see the stream report: not added
 * here, blocked on the "don't touch migrations" hard boundary). Manage-only
 * sections (create/templates/cancel) check tasks.manage and are enforced for
 * real in the server actions regardless of what this page renders.
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
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Tasks</h1>
      </div>

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My tasks</TabsTrigger>
          <TabsTrigger value="pool">Pool ({pool.length})</TabsTrigger>
          {canManage && <TabsTrigger value="manage">Manage</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s tasks</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TaskList
                tasks={mine}
                mode="mine"
                canManage={canManage}
                users={userOptions}
                positions={positionOptions}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pool">
          <Card>
            <CardHeader>
              <CardTitle>Unassigned — shift pool</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <TaskList
                tasks={pool}
                mode="pool"
                canManage={canManage}
                users={userOptions}
                positions={positionOptions}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {canManage && (
          <TabsContent value="manage" className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Create ad hoc task</CardTitle>
              </CardHeader>
              <CardContent>
                <CreateTaskForm
                  users={userOptions}
                  positions={positionOptions}
                  dayParts={dayPartOptions}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Create recurring template</CardTitle>
              </CardHeader>
              <CardContent>
                <CreateTemplateForm
                  users={userOptions}
                  positions={positionOptions}
                  dayParts={dayPartOptions}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recurring templates</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <TaskTemplatesTable
                  templates={templateRows}
                  users={userOptions}
                  positions={positionOptions}
                  dayParts={dayPartOptions}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>All tasks today</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <TaskList
                  tasks={allToday}
                  mode="all"
                  canManage={canManage}
                  users={userOptions}
                  positions={positionOptions}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
