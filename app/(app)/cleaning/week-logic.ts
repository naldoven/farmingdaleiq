import { storeLocalNow } from "@/app/(app)/checklists/logic";
import type { Half, ItemKind } from "@/app/(app)/cleaning/constants";

/**
 * Pure scheduling logic for the weekly board (docs/CLEANING-PLAN.md "How a
 * week runs"). Dates are store-local "YYYY-MM-DD" strings and all arithmetic
 * runs on UTC midnights, so a daylight-saving week can never shift a day.
 * The SQL helpers cleaning_next_open_day and cleaning_week_start in
 * 20261026030000_cleaning_board.sql mirror nextOpenDay and the Monday math
 * here; keep them in step.
 */

export type SlotHalf = "am" | "pm";

export interface Slot {
  date: string;
  /** 1 = Monday .. 6 = Saturday. */
  weekday: number;
  half: SlotHalf;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** 1 = Monday .. 7 = Sunday, like Postgres isodow. */
export function isoWeekday(date: string): number {
  const day = new Date(toUtc(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Sunday is the only closed day, so Saturday rolls to Monday. */
export function nextOpenDay(date: string): string {
  const next = addDays(date, 1);
  return isoWeekday(next) === 7 ? addDays(next, 1) : next;
}

/**
 * The Monday of the week the board shows on a given day. Sunday looks ahead
 * to the coming week: the store is closed and the next shift is Monday's.
 */
export function boardWeekStart(date: string): string {
  const dow = isoWeekday(date);
  return dow === 7 ? addDays(date, 1) : addDays(date, 1 - dow);
}

/**
 * Mon AM through Sat PM, minus any day before fromDate. With fromHalf "pm",
 * fromDate's AM is dropped too: a build that runs mid-afternoon must not hand
 * the morning shift cleans it has already gone home without.
 */
export function weekSlots(weekStart: string, fromDate: string, fromHalf: SlotHalf = "am"): Slot[] {
  const slots: Slot[] = [];
  for (let weekday = 1; weekday <= 6; weekday += 1) {
    const date = addDays(weekStart, weekday - 1);
    if (date < fromDate) continue;
    if (!(date === fromDate && fromHalf === "pm")) slots.push({ date, weekday, half: "am" });
    slots.push({ date, weekday, half: "pm" });
  }
  return slots;
}

/**
 * Store time that splits AM cleans from PM ones. The Morning Setup runs
 * opening through lunch; 2pm is the handoff the store uses today.
 */
const PM_STARTS = "14:00:00";

export function currentHalf(timeOfDay: string): SlotHalf {
  return timeOfDay < PM_STARTS ? "am" : "pm";
}

/** A rejected clean reopens on the next shift's list (plan "Checking"). */
export function redoSlot(today: string, half: SlotHalf): { date: string; half: SlotHalf } {
  if (isoWeekday(today) === 7) return { date: addDays(today, 1), half: "am" };
  return half === "am" ? { date: today, half: "pm" } : { date: nextOpenDay(today), half: "am" };
}

/** cleaning_item_last_done rows to store-local dates. */
export function lastDoneDates(
  rows: { item_id: string | null; last_done_at: string | null }[],
  timeZone: string,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.item_id || !row.last_done_at) continue;
    map.set(row.item_id, storeLocalNow(new Date(row.last_done_at), timeZone).date);
  }
  return map;
}

/**
 * Treats a clean already planned from today on as if it were done on its
 * planned date. Without this, next week's build (Thursday night, while
 * Thursday to Saturday are still open) would see a variable as still due and
 * place it a second time: a quarterly item cleaned Saturday and again
 * Monday (PR #89 review). Skipped cleans are left out on purpose; a skip
 * keeps the item overdue.
 */
export function projectLastDone(
  lastDone: Map<string, string>,
  planned: { item_id: string; date: string }[],
): Map<string, string> {
  const projected = new Map(lastDone);
  for (const row of planned) {
    const current = projected.get(row.item_id);
    if (!current || row.date > current) projected.set(row.item_id, row.date);
  }
  return projected;
}

/**
 * Next due = last clean + interval. Never-cleaned items use their start
 * date; with no start date they are due now, returned as null so they sort
 * ahead of everything. Skips never move it, which is what keeps a skipped
 * item overdue and first in line next week.
 */
export function nextDueDate(intervalWeeks: number, lastDone: string | null, startOn: string | null): string | null {
  if (lastDone) return addDays(lastDone, intervalWeeks * 7);
  return startOn ?? null;
}

export type DueState = "not_due" | "due_this_week" | "overdue";

/** The master list's green / yellow / red dot. */
export function dueState(nextDue: string | null, today: string, weekEnd: string): DueState {
  if (nextDue === null || nextDue < today) return "overdue";
  if (nextDue <= weekEnd) return "due_this_week";
  return "not_due";
}

export interface PlanItem {
  id: string;
  name: string;
  kind: ItemKind;
  days_of_week: number[] | null;
  half: Half;
  interval_weeks: number | null;
  start_on: string | null;
  sort: number;
}

export type AssignmentStatus = "planned" | "done" | "not_needed" | "skipped" | "missed";

export interface ExistingAssignment {
  item_id: string;
  date: string;
  half: SlotHalf;
  status: AssignmentStatus;
  itemKind: ItemKind;
}

export interface PlanInput {
  weekStart: string;
  /** First day that may receive cleans: today for a mid-week build. */
  fromDate: string;
  /** "pm" once fromDate's morning is over. */
  fromHalf?: SlotHalf;
  /** Active items in active zones only. */
  items: PlanItem[];
  /** Keyed "weekday|half". A missing key counts as 0. */
  caps: Map<string, number>;
  /** Store-local date of each item's last counted clean. */
  lastDone: Map<string, string>;
  /** Everything already on this week's board. */
  existing: ExistingAssignment[];
}

export interface PlannedInsert {
  item_id: string;
  date: string;
  half: SlotHalf;
  origin: "constant" | "auto";
}

function byDueThenSort(
  a: { due: string | null; item: PlanItem },
  b: { due: string | null; item: PlanItem },
): number {
  if (a.due !== b.due) {
    if (a.due === null) return -1;
    if (b.due === null) return 1;
    return a.due < b.due ? -1 : 1;
  }
  return a.item.sort - b.item.sort || a.item.name.localeCompare(b.item.name);
}

/**
 * Builds one week (plan "How a week runs" step 1). Constants land on their
 * days. Variables due by Saturday go most overdue first into the first open
 * slot on or after their due date that matches their half, falling back to
 * an earlier open slot, and land in the tray when every slot is full.
 *
 * Rerunning over its own output plans nothing: constants dedupe on their
 * exact slot, and a variable already anywhere on the week's board (moved,
 * skipped, carried over) is left alone. That, plus the unique (item, date,
 * half) index, is what makes a retried build safe.
 */
export function planWeek(input: PlanInput): { inserts: PlannedInsert[]; tray: string[] } {
  const slots = weekSlots(input.weekStart, input.fromDate, input.fromHalf);
  const weekEnd = addDays(input.weekStart, 5);
  const taken = new Set(input.existing.map((e) => `${e.item_id}|${e.date}|${e.half}`));
  const onBoard = new Set(input.existing.map((e) => e.item_id));
  const load = new Map<string, number>();
  const slotKey = (s: { date: string; half: SlotHalf }) => `${s.date}|${s.half}`;
  for (const e of input.existing) {
    // A skipped clean frees its place; the cap is about real work that day.
    if (e.itemKind === "variable" && e.status !== "skipped") {
      load.set(slotKey(e), (load.get(slotKey(e)) ?? 0) + 1);
    }
  }
  const capOf = (s: Slot) => input.caps.get(`${s.weekday}|${s.half}`) ?? 0;

  const inserts: PlannedInsert[] = [];
  const tray: string[] = [];

  const constants = input.items
    .filter((i) => i.kind === "constant")
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  for (const item of constants) {
    const days = new Set(item.days_of_week ?? []);
    for (const slot of slots) {
      if (!days.has(slot.weekday) || slot.half !== item.half) continue;
      const key = `${item.id}|${slot.date}|${slot.half}`;
      if (taken.has(key)) continue;
      taken.add(key);
      inserts.push({ item_id: item.id, date: slot.date, half: slot.half, origin: "constant" });
    }
  }

  const variables = input.items
    .filter((i) => i.kind === "variable" && i.interval_weeks !== null && !onBoard.has(i.id))
    .map((item) => ({
      item,
      due: nextDueDate(item.interval_weeks!, input.lastDone.get(item.id) ?? null, item.start_on),
    }))
    .filter((v) => v.due === null || v.due <= weekEnd)
    .sort(byDueThenSort);

  for (const { item, due } of variables) {
    const open = slots.filter(
      (s) => (item.half === "either" || s.half === item.half) && (load.get(slotKey(s)) ?? 0) < capOf(s),
    );
    // Past the due date if possible; otherwise as close to it as the week
    // allows, so a full Saturday does not pull a weekly clean back to Monday
    // and drift its due date earlier every week.
    const pick = open.find((s) => due === null || s.date >= due) ?? open.at(-1);
    if (!pick) {
      tray.push(item.id);
      continue;
    }
    load.set(slotKey(pick), (load.get(slotKey(pick)) ?? 0) + 1);
    inserts.push({ item_id: item.id, date: pick.date, half: pick.half, origin: "auto" });
  }

  return { inserts, tray };
}

/**
 * The board's "due, not placed" tray: variables due by Saturday that have no
 * clean anywhere on the week. Same rule the build uses, read live so an item
 * approved mid-week shows up without a rebuild. Pass lastDone through
 * projectLastDone, as the build does.
 */
export function dueNotPlaced(input: Omit<PlanInput, "caps" | "fromDate" | "fromHalf">): string[] {
  const weekEnd = addDays(input.weekStart, 5);
  const onBoard = new Set(input.existing.map((e) => e.item_id));
  return input.items
    .filter((i) => i.kind === "variable" && i.interval_weeks !== null && !onBoard.has(i.id))
    .map((item) => ({
      item,
      due: nextDueDate(item.interval_weeks!, input.lastDone.get(item.id) ?? null, item.start_on),
    }))
    .filter((v) => v.due === null || v.due <= weekEnd)
    .sort(byDueThenSort)
    .map((v) => v.item.id);
}
