import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/events/bus", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

import { emitEvent } from "@/lib/events/bus";
import type { Database } from "@/lib/db/types";
import {
  buildTaskInsert,
  materializeTasksForDate,
  templatesDueOn,
  type TaskTemplateRow,
} from "./materialize";

const MONDAY = "2026-07-13"; // 2026-07-13 is a Monday (dow 1)
const SATURDAY = "2026-07-11"; // dow 6

function template(overrides: Partial<TaskTemplateRow>): TaskTemplateRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Stock napkins",
    description: null,
    frequency: "daily",
    days_of_week: null,
    day_part_id: null,
    start_time: null,
    due_time: null,
    assign_position_id: null,
    assign_user_id: null,
    token_value: 5,
    active: true,
    discord_channel_id: null,
    notify_discord: false,
    ...overrides,
  };
}

describe("templatesDueOn", () => {
  it("includes an active daily template every day", () => {
    const t = template({ frequency: "daily" });
    expect(templatesDueOn([t], MONDAY)).toEqual([t]);
    expect(templatesDueOn([t], SATURDAY)).toEqual([t]);
  });

  it("excludes an inactive template", () => {
    const t = template({ active: false });
    expect(templatesDueOn([t], MONDAY)).toEqual([]);
  });

  it("includes a weekly template only on its configured days", () => {
    const t = template({ frequency: "weekly", days_of_week: [6] }); // Saturday
    expect(templatesDueOn([t], SATURDAY)).toEqual([t]);
    expect(templatesDueOn([t], MONDAY)).toEqual([]);
  });

  it("excludes a weekly template with no days configured", () => {
    const t = template({ frequency: "weekly", days_of_week: null });
    expect(templatesDueOn([t], MONDAY)).toEqual([]);
  });
});

describe("buildTaskInsert", () => {
  it("carries template fields onto the task row", () => {
    const t = template({
      due_time: "14:30:00",
      assign_position_id: "22222222-2222-4222-8222-222222222222",
      token_value: 10,
    });
    const insert = buildTaskInsert(t, MONDAY);
    expect(insert).toMatchObject({
      template_id: t.id,
      kind: "recurring",
      title: t.title,
      date: MONDAY,
      due_at: `${MONDAY}T14:30:00`,
      assigned_position_id: t.assign_position_id,
      status: "pending",
      token_value: 10,
    });
  });

  it("leaves due_at null when the template has no due_time", () => {
    const t = template({ due_time: null });
    expect(buildTaskInsert(t, MONDAY).due_at).toBeNull();
  });
});

// Minimal fake Supabase query builder covering exactly the chains
// materializeTasksForDate uses: .from().select().eq() and
// .from().select().eq().in(), plus .from().insert(). Not a general mock.
function fakeSupabase(opts: {
  templates: TaskTemplateRow[];
  existingTasks: Array<{ template_id: string; date: string }>;
  captured: Array<Record<string, unknown>>;
}) {
  const { templates, existingTasks, captured } = opts;
  return {
    from(table: string) {
      if (table === "task_templates") {
        return {
          select() {
            return {
              eq(col: string, val: unknown) {
                const rows = templates.filter(
                  (t) => (t as unknown as Record<string, unknown>)[col] === val,
                );
                return Promise.resolve({ data: rows, error: null });
              },
            };
          },
        };
      }
      if (table === "tasks") {
        return {
          select() {
            return {
              eq(col: string, val: unknown) {
                return {
                  in(col2: string, vals: unknown[]) {
                    const rows = existingTasks.filter(
                      (r) =>
                        (r as unknown as Record<string, unknown>)[col] === val &&
                        vals.includes((r as unknown as Record<string, unknown>)[col2]),
                    );
                    return Promise.resolve({ data: rows, error: null });
                  },
                };
              },
            };
          },
          insert(rows: Array<Record<string, unknown>>) {
            captured.push(...rows);
            return Promise.resolve({ error: null });
          },
          upsert(rows: Array<Record<string, unknown>>) {
            captured.push(...rows);
            return {
              select() {
                // ignoreDuplicates returns only the rows actually inserted; the
                // fake treats every passed row as newly inserted (the caller
                // already filtered out already-materialized template+date pairs).
                return Promise.resolve({
                  data: rows.map((r, i) => ({
                    id: `task-${i}`,
                    assigned_user_id: r.assigned_user_id ?? null,
                    assigned_position_id: r.assigned_position_id ?? null,
                  })),
                  error: null,
                });
              },
            };
          },
        };
      }
      throw new Error(`fakeSupabase: unexpected table ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
}

describe("materializeTasksForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a task for a due template with no existing task", async () => {
    const t = template({ frequency: "daily" });
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({ templates: [t], existingTasks: [], captured });

    const result = await materializeTasksForDate(supabase, MONDAY);

    expect(result).toEqual({ created: 1, skipped: 0 });
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ template_id: t.id, date: MONDAY });
  });

  it("is idempotent: running twice for the same date does not duplicate", async () => {
    const t = template({ frequency: "daily" });
    const captured: Array<Record<string, unknown>> = [];
    // Simulates the second run: a task for this template+date already exists.
    const supabase = fakeSupabase({
      templates: [t],
      existingTasks: [{ template_id: t.id, date: MONDAY }],
      captured,
    });

    const result = await materializeTasksForDate(supabase, MONDAY);

    expect(result).toEqual({ created: 0, skipped: 1 });
    expect(captured).toHaveLength(0);
  });

  it("skips templates that are not due on the target date", async () => {
    const t = template({ frequency: "weekly", days_of_week: [6] });
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({ templates: [t], existingTasks: [], captured });

    const result = await materializeTasksForDate(supabase, MONDAY);

    expect(result).toEqual({ created: 0, skipped: 0 });
    expect(captured).toHaveLength(0);
  });

  it("emits task_assigned for a newly-materialized pre-assigned recurring task", async () => {
    const t = template({
      frequency: "daily",
      assign_user_id: "99999999-9999-4999-8999-999999999999",
    });
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({ templates: [t], existingTasks: [], captured });

    await materializeTasksForDate(supabase, MONDAY);

    expect(emitEvent).toHaveBeenCalledWith(
      "task_assigned",
      expect.objectContaining({ user_id: t.assign_user_id }),
    );
  });

  it("does not emit task_assigned for an unassigned recurring task", async () => {
    const t = template({ frequency: "daily", assign_user_id: null, assign_position_id: null });
    const captured: Array<Record<string, unknown>> = [];
    const supabase = fakeSupabase({ templates: [t], existingTasks: [], captured });

    await materializeTasksForDate(supabase, MONDAY);

    expect(emitEvent).not.toHaveBeenCalled();
  });
});
