import { describe, expect, it } from "vitest";

import {
  parseSetupDate,
  planAdhocTaskBackfillsForSetup,
  planChecklistRunsForSetup,
  planTasksForSetup,
  type ExistingAdhocTaskRow,
  type ExistingRunRow,
  type ExistingTaskRow,
  type ScheduleRow,
} from "./setup-fanout";
import type { TaskTemplateRow } from "@/app/(app)/tasks/materialize";

// 2026-07-10 is a Friday (getDay() === 5).
const FRIDAY = "2026-07-10";
const runDate = parseSetupDate(FRIDAY);

function schedule(overrides: Partial<ScheduleRow> & Pick<ScheduleRow, "id" | "template_id">): ScheduleRow {
  return {
    frequency: "daily",
    days_of_week: null,
    day_of_month: null,
    day_part_id: null,
    assign_position_id: null,
    assign_team_id: null,
    ...overrides,
  };
}

describe("planChecklistRunsForSetup", () => {
  const base = {
    date: FRIDAY,
    setupDayPartId: "dp-1",
    positionUser: new Map([["pos-1", "user-1"]]),
    activeTemplateIds: new Set(["tpl-1"]),
    runDateFor: runDate,
  };

  it("materializes one run for a position-linked daily schedule whose position is staffed", () => {
    const plan = planChecklistRunsForSetup({
      ...base,
      schedules: [schedule({ id: "sch-1", template_id: "tpl-1", assign_position_id: "pos-1" })],
      existingRuns: [],
    });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({
      schedule_id: "sch-1",
      template_id: "tpl-1",
      run_date: FRIDAY,
      assigned_position_id: "pos-1",
      assigned_user_id: "user-1",
      status: "pending",
    });
    expect(plan.backfills).toHaveLength(0);
  });

  it("is idempotent: an existing run for the schedule+date produces no insert", () => {
    const existing: ExistingRunRow[] = [
      { id: "run-1", schedule_id: "sch-1", assigned_user_id: "user-1", assigned_team_id: null },
    ];
    const plan = planChecklistRunsForSetup({
      ...base,
      schedules: [schedule({ id: "sch-1", template_id: "tpl-1", assign_position_id: "pos-1" })],
      existingRuns: existing,
    });
    expect(plan.inserts).toHaveLength(0);
    expect(plan.backfills).toHaveLength(0);
  });

  it("backfills the assignee onto a cron-created run that has no assignee yet", () => {
    const existing: ExistingRunRow[] = [
      { id: "run-1", schedule_id: "sch-1", assigned_user_id: null, assigned_team_id: null },
    ];
    const plan = planChecklistRunsForSetup({
      ...base,
      schedules: [schedule({ id: "sch-1", template_id: "tpl-1", assign_position_id: "pos-1" })],
      existingRuns: existing,
    });
    expect(plan.inserts).toHaveLength(0);
    expect(plan.backfills).toEqual([{ id: "run-1", assigned_user_id: "user-1" }]);
  });

  it("skips schedules whose position is unstaffed, inactive template, wrong day-part, or not due", () => {
    const plan = planChecklistRunsForSetup({
      ...base,
      schedules: [
        // position not staffed
        schedule({ id: "a", template_id: "tpl-1", assign_position_id: "pos-9" }),
        // template inactive
        schedule({ id: "b", template_id: "tpl-x", assign_position_id: "pos-1" }),
        // different day-part
        schedule({ id: "c", template_id: "tpl-1", assign_position_id: "pos-1", day_part_id: "dp-other" }),
        // weekly, not due on Friday
        schedule({
          id: "d",
          template_id: "tpl-1",
          assign_position_id: "pos-1",
          frequency: "weekly",
          days_of_week: [1],
        }),
      ],
      existingRuns: [],
    });
    expect(plan.inserts).toHaveLength(0);
  });

  it("matches a schedule with no day-part against any setup day-part", () => {
    const plan = planChecklistRunsForSetup({
      ...base,
      schedules: [schedule({ id: "sch-1", template_id: "tpl-1", assign_position_id: "pos-1", day_part_id: null })],
      existingRuns: [],
    });
    expect(plan.inserts).toHaveLength(1);
  });

  it("does not match a day-part-specific schedule against a null-day-part setup", () => {
    const plan = planChecklistRunsForSetup({
      ...base,
      setupDayPartId: null,
      schedules: [
        schedule({ id: "sch-1", template_id: "tpl-1", assign_position_id: "pos-1", day_part_id: "dp-1" }),
      ],
      existingRuns: [],
    });
    expect(plan.inserts).toHaveLength(0);
  });

  it("copies the schedule's assign_team_id onto a newly materialized run", () => {
    const plan = planChecklistRunsForSetup({
      ...base,
      schedules: [
        schedule({ id: "sch-1", template_id: "tpl-1", assign_position_id: "pos-1", assign_team_id: "team-1" }),
      ],
      existingRuns: [],
    });
    expect(plan.inserts[0]).toMatchObject({ assigned_team_id: "team-1" });
  });

  it("backfills the team id onto a cron-created run missing one, alongside the assignee", () => {
    const existing: ExistingRunRow[] = [
      { id: "run-1", schedule_id: "sch-1", assigned_user_id: null, assigned_team_id: null },
    ];
    const plan = planChecklistRunsForSetup({
      ...base,
      schedules: [
        schedule({ id: "sch-1", template_id: "tpl-1", assign_position_id: "pos-1", assign_team_id: "team-1" }),
      ],
      existingRuns: existing,
    });
    expect(plan.backfills).toEqual([{ id: "run-1", assigned_user_id: "user-1", assigned_team_id: "team-1" }]);
  });

  it("does not clobber a run's existing assigned_team_id during backfill", () => {
    const existing: ExistingRunRow[] = [
      { id: "run-1", schedule_id: "sch-1", assigned_user_id: null, assigned_team_id: "team-existing" },
    ];
    const plan = planChecklistRunsForSetup({
      ...base,
      schedules: [
        schedule({ id: "sch-1", template_id: "tpl-1", assign_position_id: "pos-1", assign_team_id: "team-1" }),
      ],
      existingRuns: existing,
    });
    expect(plan.backfills).toEqual([{ id: "run-1", assigned_user_id: "user-1" }]);
  });
});

function template(
  overrides: Partial<TaskTemplateRow> & Pick<TaskTemplateRow, "id">,
): TaskTemplateRow {
  return {
    title: "Task",
    description: null,
    frequency: "daily",
    days_of_week: null,
    day_part_id: null,
    start_time: null,
    due_time: null,
    assign_position_id: null,
    assign_user_id: null,
    token_value: 0,
    active: true,
    discord_channel_id: null,
    notify_discord: false,
    ...overrides,
  };
}

describe("planTasksForSetup", () => {
  const base = {
    date: FRIDAY,
    setupId: "setup-1",
    setupDayPartId: "dp-1",
    positionUser: new Map([["pos-1", "user-1"]]),
  };

  it("materializes one task for a position-linked template, attached to the assignee + setup", () => {
    const plan = planTasksForSetup({
      ...base,
      templates: [template({ id: "tpl-1", assign_position_id: "pos-1", token_value: 5 })],
      existingTasks: [],
    });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({
      template_id: "tpl-1",
      date: FRIDAY,
      assigned_position_id: "pos-1",
      assigned_user_id: "user-1",
      setup_id: "setup-1",
      token_value: 5,
      kind: "recurring",
    });
  });

  it("is idempotent on (template_id, date): an existing task produces no insert", () => {
    const existing: ExistingTaskRow[] = [
      { id: "task-1", template_id: "tpl-1", assigned_user_id: "user-1" },
    ];
    const plan = planTasksForSetup({
      ...base,
      templates: [template({ id: "tpl-1", assign_position_id: "pos-1" })],
      existingTasks: existing,
    });
    expect(plan.inserts).toHaveLength(0);
    expect(plan.backfills).toHaveLength(0);
  });

  it("backfills the assignee onto a cron-created, unassigned task", () => {
    const existing: ExistingTaskRow[] = [
      { id: "task-1", template_id: "tpl-1", assigned_user_id: null },
    ];
    const plan = planTasksForSetup({
      ...base,
      templates: [template({ id: "tpl-1", assign_position_id: "pos-1" })],
      existingTasks: existing,
    });
    expect(plan.backfills).toEqual([{ id: "task-1", assigned_user_id: "user-1" }]);
  });

  it("ignores templates whose position is not on the setup", () => {
    const plan = planTasksForSetup({
      ...base,
      templates: [template({ id: "tpl-1", assign_position_id: "pos-other" })],
      existingTasks: [],
    });
    expect(plan.inserts).toHaveLength(0);
  });
});

describe("planAdhocTaskBackfillsForSetup", () => {
  const base = {
    setupDayPartId: "dp-1",
    positionUser: new Map([["pos-1", "user-1"]]),
  };

  it("backfills an ad hoc, position-linked task with no assignee once its position is staffed", () => {
    const tasks: ExistingAdhocTaskRow[] = [
      { id: "task-1", assigned_position_id: "pos-1", day_part_id: null },
    ];
    const backfills = planAdhocTaskBackfillsForSetup({ ...base, tasks });
    expect(backfills).toEqual([{ id: "task-1", assigned_user_id: "user-1" }]);
  });

  it("ignores an ad hoc task whose position is not staffed on this setup", () => {
    const tasks: ExistingAdhocTaskRow[] = [
      { id: "task-1", assigned_position_id: "pos-9", day_part_id: null },
    ];
    const backfills = planAdhocTaskBackfillsForSetup({ ...base, tasks });
    expect(backfills).toHaveLength(0);
  });

  it("respects day-part matching: a day-part-specific ad hoc task is not backfilled for a different setup day-part", () => {
    const tasks: ExistingAdhocTaskRow[] = [
      { id: "task-1", assigned_position_id: "pos-1", day_part_id: "dp-other" },
    ];
    const backfills = planAdhocTaskBackfillsForSetup({ ...base, tasks });
    expect(backfills).toHaveLength(0);
  });

  it("backfills a day-part-agnostic ad hoc task against any setup day-part", () => {
    const tasks: ExistingAdhocTaskRow[] = [
      { id: "task-1", assigned_position_id: "pos-1", day_part_id: null },
    ];
    const backfills = planAdhocTaskBackfillsForSetup({ ...base, setupDayPartId: null, tasks });
    expect(backfills).toEqual([{ id: "task-1", assigned_user_id: "user-1" }]);
  });
});

describe("parseSetupDate", () => {
  it("parses YYYY-MM-DD as local midnight (Friday for 2026-07-10)", () => {
    const d = parseSetupDate("2026-07-10");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(10);
    expect(d.getDay()).toBe(5);
  });
});
