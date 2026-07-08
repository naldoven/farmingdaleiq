import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ClipboardCheck,
  ClipboardList,
  Crown,
  Megaphone,
  Plus,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  HScroll,
  ListRow,
  ProgressBar,
  SectionCard,
  StatTile,
  StatusBadge,
} from "@/components/mobile";
import { TeamFilters } from "@/components/team/team-filters";
import { fetchMyInfractions } from "@/app/(app)/accountability/queries";
import {
  rollupByCategory,
  type WasteCategoryForRollup,
  type WasteEntryForRollup,
  type WasteItemForRollup,
  type WasteUnit,
} from "@/app/(app)/waste/logic";
import { summarizeBreaks, summarizeToDos, type BreakSummaryInput, type DueSoonSource } from "@/app/(app)/team/dashboard-logic";
import { hasPermission } from "@/lib/auth/permissions";
import { computeBreakDueAt } from "@/lib/breaks/entitlement";
import { createClient } from "@/lib/supabase/server";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "14:30:00" -> "2:30 PM". Day-part start/end times have no date attached. */
function formatClockTime(time: string): string {
  const [hourStr, minuteStr] = time.split(":");
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minuteStr} ${period}`;
}

/** Same convention as components/tasks/task-list.tsx's local formatDue. */
function formatDueAt(dueAt: string | null): string {
  if (!dueAt) return "No due time";
  const d = new Date(dueAt);
  if (Number.isNaN(d.getTime())) return "No due time";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The round accent "+" assign button trailing each Due Soon row. */
function AssignLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={`Assign ${label}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform active:scale-95"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

/**
 * /team -- the Team daypart dashboard (KitchenIQ mobile redesign,
 * docs/DESIGN-SYSTEM.md). Replaces the old feed-only /team; the feed itself
 * moved to /team/feed (kept fully working, actions untouched) and is
 * summarized here by the Broadcasts card.
 *
 * Every section is permission-gated the same way its source page already is
 * (setups.view, tasks.complete/checklists.complete, accountability.manage/
 * view_own, waste.manage/reports.view, breaks.view) so this dashboard never
 * shows a role more than its own pages would.
 */
export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ dayPartId?: string; side?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { dayPartId, side } = await searchParams;
  const selectedSide: "foh" | "boh" = side === "boh" ? "boh" : "foh";
  const today = todayIso();

  const [
    canViewSetups,
    canDoTasks,
    canDoChecklists,
    canManageWaste,
    canViewWasteReports,
    canManageAccountability,
    canViewOwnAccountability,
    canViewBreaks,
  ] = await Promise.all([
    hasPermission("setups.view"),
    hasPermission("tasks.complete"),
    hasPermission("checklists.complete"),
    hasPermission("waste.manage"),
    hasPermission("reports.view"),
    hasPermission("accountability.manage"),
    hasPermission("accountability.view_own"),
    hasPermission("breaks.view"),
  ]);
  // Same tiering as /waste's own rollup tab (app/(app)/waste/page.tsx):
  // waste.manage or the one-tier-lower reports.view.
  const canViewWasteRollup = canManageWaste || canViewWasteReports;

  const { data: dayParts } = await supabase
    .from("day_parts")
    .select("id, name, start_time, end_time")
    .order("sort");

  const selectedDayPartId = dayPartId ?? dayParts?.[0]?.id ?? "";
  const selectedDayPart = (dayParts ?? []).find((d) => d.id === selectedDayPartId) ?? null;

  // Leadership + Setups: both scoped to today's setup for the selected
  // day-part, same granularity /setups and /breaks already use.
  let setupRow: { id: string; posted_at: string | null; shift_leader_id: string | null } | null = null;
  let leaderName: string | null = null;
  if (canViewSetups && selectedDayPartId) {
    const { data } = await supabase
      .from("setups")
      .select("id, posted_at, shift_leader_id")
      .eq("date", today)
      .eq("day_part_id", selectedDayPartId)
      .maybeSingle();
    setupRow = data ?? null;

    if (setupRow?.shift_leader_id) {
      const { data: leader } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", setupRow.shift_leader_id)
        .maybeSingle();
      leaderName = leader?.name ?? null;
    }
  }

  // To-Dos: today's tasks + checklist runs combined, not scoped by
  // day-part (mirrors how /tasks and /checklists both list "today", store-wide).
  let toDoSummary = summarizeToDos([]);
  if (canDoTasks || canDoChecklists) {
    const [{ data: tasks }, { data: runs }, { data: templates }] = await Promise.all([
      canDoTasks
        ? supabase.from("tasks").select("id, title, due_at, status").eq("date", today).neq("status", "cancelled")
        : Promise.resolve({ data: [] as { id: string; title: string; due_at: string | null; status: string }[] }),
      canDoChecklists
        ? supabase.from("checklist_runs").select("id, template_id, day_part_id, status").eq("run_date", today)
        : Promise.resolve({
            data: [] as { id: string; template_id: string; day_part_id: string | null; status: string }[],
          }),
      canDoChecklists
        ? supabase.from("checklist_templates").select("id, name")
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const dayPartById = new Map((dayParts ?? []).map((d) => [d.id, d]));
    const templateNameById = new Map((templates ?? []).map((t) => [t.id, t.name]));

    const items: DueSoonSource[] = [
      ...(tasks ?? []).map((t) => ({
        id: `task-${t.id}`,
        kind: "task" as const,
        title: t.title,
        dueAt: t.due_at,
        completed: t.status === "completed",
      })),
      ...(runs ?? []).map((r) => {
        const dp = r.day_part_id ? dayPartById.get(r.day_part_id) : undefined;
        // checklist_runs has no due_at column (supabase/migrations/
        // 20260707000700_checklists.sql): its day-part's end time stands in
        // for "due by" so it can still sort/display alongside real task
        // due times.
        const dueAt = dp ? `${today}T${dp.end_time}` : null;
        return {
          id: `checklist-${r.id}`,
          kind: "checklist" as const,
          title: templateNameById.get(r.template_id) ?? "Checklist",
          dueAt,
          completed: r.status === "completed",
        };
      }),
    ];

    toDoSummary = summarizeToDos(items);
  }

  // Accountability: store-wide recent items for managers, else the viewer's
  // own record (same anonymity rule as /accountability -- my_infractions
  // never exposes issued_by).
  interface AccountabilityRow {
    id: string;
    title: string;
    description: string;
  }
  let accountabilityRows: AccountabilityRow[] = [];
  if (canManageAccountability) {
    const [{ data: infractions }, { data: types }, { data: profiles }] = await Promise.all([
      supabase
        .from("infractions")
        .select("id, user_id, type_id, points, issued_at")
        .order("issued_at", { ascending: false })
        .limit(5),
      supabase.from("infraction_types").select("id, name"),
      supabase.from("profiles").select("id, name"),
    ]);
    const typeNameById = new Map((types ?? []).map((t) => [t.id, t.name]));
    const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));
    accountabilityRows = (infractions ?? []).map((i) => ({
      id: i.id,
      title: profileNameById.get(i.user_id) ?? "Team member",
      description: `${typeNameById.get(i.type_id) ?? "Infraction"} · ${i.points} pts`,
    }));
  } else if (canViewOwnAccountability) {
    const { data: myInfractions } = await fetchMyInfractions(supabase);
    accountabilityRows = myInfractions.slice(0, 5).map((i) => ({
      id: i.id,
      title: i.type_name,
      description: `${i.points} pts`,
    }));
  }

  // Waste: today's total $ + a category breakdown (top two by cost). The
  // KitchenIQ "Primary/Secondary" split has no equivalent field in this
  // schema (waste_items/waste_categories are admin-defined, not tagged
  // primary/secondary -- supabase/migrations/20260707000900_waste.sql), so
  // this shows the two highest-cost real categories instead of inventing a
  // primary/secondary flag.
  let wasteTotal: number | null = null;
  let wasteBreakdown: { categoryName: string; totalCost: number | null }[] = [];
  if (canViewWasteRollup) {
    const dayStart = new Date(`${today}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const [{ data: entries }, { data: items }, { data: categories }] = await Promise.all([
      supabase
        .from("waste_entries")
        .select("id, item_id, quantity, logged_at")
        .gte("logged_at", dayStart.toISOString())
        .lt("logged_at", dayEnd.toISOString()),
      supabase.from("waste_items").select("id, name, category_id, unit, unit_cost"),
      supabase.from("waste_categories").select("id, name"),
    ]);

    if ((entries ?? []).length > 0) {
      const rollupEntries: WasteEntryForRollup[] = (entries ?? []).map((e) => ({
        id: e.id,
        itemId: e.item_id,
        quantity: e.quantity,
        loggedAt: e.logged_at,
      }));
      const rollupItems: WasteItemForRollup[] = (items ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        categoryId: i.category_id,
        unit: i.unit as WasteUnit,
        unitCost: i.unit_cost,
      }));
      const rollupCategories: WasteCategoryForRollup[] = (categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
      }));

      const categoryRows = rollupByCategory(rollupEntries, rollupItems, rollupCategories);
      wasteTotal = categoryRows.reduce((sum, row) => sum + (row.totalCost ?? 0), 0);
      wasteBreakdown = categoryRows
        .slice(0, 2)
        .map((row) => ({ categoryName: row.categoryName, totalCost: row.totalCost }));
    }
  }

  // Broadcasts: recent broadcast-kind feed posts only (recognitions still
  // live on the full /team/feed).
  const { data: broadcastPosts } = await supabase
    .from("feed_posts")
    .select("id, author_id, body, created_at")
    .eq("kind", "broadcast")
    .order("created_at", { ascending: false })
    .limit(3);
  const broadcastAuthorIds = [
    ...new Set((broadcastPosts ?? []).map((p) => p.author_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: broadcastAuthors } = broadcastAuthorIds.length
    ? await supabase.from("profiles").select("id, name").in("id", broadcastAuthorIds)
    : { data: [] as { id: string; name: string }[] };
  const broadcastAuthorNameById = new Map((broadcastAuthors ?? []).map((p) => [p.id, p.name]));

  // Breaks: Remaining/Completed/Next Hour for the selected day-part's setup
  // (same source data as /breaks, computeBreakDueAt reused rather than
  // re-derived).
  let breakSummary = { remaining: 0, completed: 0, nextHour: 0 };
  if (canViewBreaks && setupRow) {
    const [{ data: breaksData }, { data: assignments }] = await Promise.all([
      supabase.from("breaks").select("id, user_id, status, rule_id").eq("setup_id", setupRow.id),
      supabase.from("setup_assignments").select("user_id, arrival_time").eq("setup_id", setupRow.id),
    ]);

    const ruleIds = [
      ...new Set((breaksData ?? []).map((b) => b.rule_id).filter((id): id is string => Boolean(id))),
    ];
    const { data: rules } = ruleIds.length
      ? await supabase.from("break_rules").select("id, min_shift_minutes").in("id", ruleIds)
      : { data: [] as { id: string; min_shift_minutes: number }[] };
    const ruleById = new Map((rules ?? []).map((r) => [r.id, r]));
    const arrivalByUser = new Map(
      (assignments ?? []).filter((a) => a.user_id).map((a) => [a.user_id as string, a.arrival_time]),
    );

    const breakInputs: BreakSummaryInput[] = (breaksData ?? []).map((b) => {
      const rule = b.rule_id ? (ruleById.get(b.rule_id) ?? null) : null;
      const arrivalIso = b.user_id ? (arrivalByUser.get(b.user_id) ?? null) : null;
      const dueAt = computeBreakDueAt(arrivalIso ? new Date(arrivalIso) : null, rule);
      return { status: b.status, dueAt: dueAt?.toISOString() ?? null };
    });

    breakSummary = summarizeBreaks(breakInputs, new Date());
  }

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <TeamFilters
        dayParts={(dayParts ?? []).map((d) => ({ id: d.id, name: d.name }))}
        selectedDayPartId={selectedDayPartId}
        selectedSide={selectedSide}
      />

      {canViewSetups && (
        <SectionCard title="Leadership">
          <ListRow
            icon={Crown}
            iconTone="accent"
            title={leaderName ?? "Unassigned"}
            description={selectedDayPart ? `${selectedDayPart.name} shift leader` : "Shift leader"}
            href={selectedDayPartId ? `/setups?date=${today}&dayPartId=${selectedDayPartId}` : undefined}
          />
        </SectionCard>
      )}

      {(canDoTasks || canDoChecklists) && (
        <SectionCard title="To-Dos" expandHref="/tasks">
          <div className="flex flex-col gap-3">
            <ProgressBar value={toDoSummary.percentComplete} tone="accent" label="Completed" />
            {toDoSummary.dueSoon.length === 0 ? (
              <p className="text-[13px] text-muted-ink">Nothing due right now.</p>
            ) : (
              <div className="-mx-4 flex flex-col divide-y divide-line">
                {toDoSummary.dueSoon.map((item) => (
                  <ListRow
                    key={item.id}
                    icon={item.kind === "task" ? ClipboardList : ClipboardCheck}
                    iconTone={item.kind === "task" ? "accent" : "info"}
                    title={item.title}
                    description={`Due ${formatDueAt(item.dueAt)}`}
                    trailing={
                      <AssignLink
                        href={item.kind === "task" ? "/tasks" : "/checklists"}
                        label={item.title}
                      />
                    }
                  />
                ))}
              </div>
            )}
            {toDoSummary.moreCount > 0 && (
              <Link href="/tasks" className="text-[13px] font-semibold text-accent">
                View {toDoSummary.moreCount} More
              </Link>
            )}
          </div>
        </SectionCard>
      )}

      {canViewSetups && (
        <SectionCard title="Setups" expandHref="/setups">
          {!selectedDayPart ? (
            <p className="text-[13px] text-muted-ink">No day-parts configured.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[15px] font-semibold text-ink">{selectedDayPart.name}</p>
                  <p className="text-[13px] text-muted-ink">
                    {formatClockTime(selectedDayPart.start_time)} – {formatClockTime(selectedDayPart.end_time)}
                  </p>
                </div>
                <StatusBadge tone={setupRow?.posted_at ? "success" : "warning"} dot>
                  {setupRow?.posted_at ? "Posted" : setupRow ? "Draft" : "Not started"}
                </StatusBadge>
              </div>
              <Button asChild className="w-full">
                <Link href={`/setups?date=${today}&dayPartId=${selectedDayPartId}`}>Build</Link>
              </Button>
            </div>
          )}
        </SectionCard>
      )}

      {(canManageAccountability || canViewOwnAccountability) && (
        <SectionCard title="Accountability" expandHref="/accountability">
          {accountabilityRows.length === 0 ? (
            <p className="text-[13px] text-muted-ink">No accountability items</p>
          ) : (
            <div className="-mx-4 flex flex-col divide-y divide-line">
              {accountabilityRows.map((row) => (
                <ListRow
                  key={row.id}
                  icon={ShieldAlert}
                  iconTone="danger"
                  title={row.title}
                  description={row.description}
                />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {canViewWasteRollup && (
        <SectionCard title="Waste" expandHref="/waste">
          {wasteTotal === null ? (
            <p className="text-[13px] text-muted-ink">No waste logged today.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[13px] text-muted-ink">Today&apos;s total</p>
                <p className="text-[30px] font-bold text-danger">${wasteTotal.toFixed(2)}</p>
              </div>
              <HScroll>
                {wasteBreakdown.map((row) => (
                  <StatTile
                    key={row.categoryName}
                    value={row.totalCost != null ? `$${row.totalCost.toFixed(2)}` : "—"}
                    label={row.categoryName}
                    tone="danger"
                  />
                ))}
              </HScroll>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title="Broadcasts" expandHref="/team/feed">
        {(broadcastPosts ?? []).length === 0 ? (
          <p className="text-[13px] text-muted-ink">No broadcasts yet.</p>
        ) : (
          <div className="-mx-4 flex flex-col divide-y divide-line">
            {(broadcastPosts ?? []).map((post) => (
              <ListRow
                key={post.id}
                icon={Megaphone}
                iconTone="warning"
                title={post.author_id ? (broadcastAuthorNameById.get(post.author_id) ?? "A leader") : "A leader"}
                description={post.body ?? undefined}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {canViewBreaks && (
        <SectionCard title="Breaks" expandHref="/breaks">
          <HScroll>
            <StatTile value={breakSummary.remaining} label="Remaining" tone="warning" />
            <StatTile value={breakSummary.completed} label="Completed" tone="success" />
            <StatTile
              value={breakSummary.nextHour}
              label="Next Hour"
              tone={breakSummary.nextHour > 0 ? "danger" : "neutral"}
            />
          </HScroll>
        </SectionCard>
      )}
    </div>
  );
}
