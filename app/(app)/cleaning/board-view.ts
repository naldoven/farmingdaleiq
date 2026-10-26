import { STORE_WEEKDAYS, type ItemKind } from "@/app/(app)/cleaning/constants";
import { cadenceLabel } from "@/app/(app)/cleaning/logic";
import {
  addDays,
  isoWeekday,
  type AssignmentStatus,
  type ExistingAssignment,
  type PlanItem,
  type SlotHalf,
} from "@/app/(app)/cleaning/week-logic";

/**
 * Pure view logic for the weekly board and its print sheet
 * (docs/CLEANING-PLAN.md "Screens": /cleaning/week). Rows go in, plain
 * serializable cards and day groups come out, so the grouping, ordering,
 * labels and load-versus-cap math are tested without Supabase or React. No
 * zod and no React imports: client components load this file.
 */

export type Origin = "constant" | "auto" | "manual" | "carry_over" | "redo";
export type Tone = "success" | "danger" | "warning" | "info" | "neutral" | "accent";

export interface BoardZone {
  id: string;
  name: string;
  color: string;
  side: string;
  sort: number;
}

/** The item fields a card needs. Retired items stay readable so history still has a name. */
export interface BoardItem {
  id: string;
  name: string;
  zone_id: string;
  kind: string;
  sort: number;
}

export interface BoardAssignment {
  id: string;
  item_id: string;
  date: string;
  half: SlotHalf;
  origin: Origin;
  status: AssignmentStatus;
  skip_reason: string | null;
}

/** A cleaning_assignments row as the database types it (plain strings). */
export interface AssignmentRowLike {
  id: string;
  item_id: string;
  date: string;
  half: string;
  origin: string;
  status: string;
  skip_reason: string | null;
}

/** The check constraints on the table guarantee these values, so a cast is safe. */
export function toBoardAssignments(rows: AssignmentRowLike[]): BoardAssignment[] {
  return rows.map((r) => ({
    id: r.id,
    item_id: r.item_id,
    date: r.date,
    half: r.half as SlotHalf,
    origin: r.origin as Origin,
    status: r.status as AssignmentStatus,
    skip_reason: r.skip_reason,
  }));
}

/** What planWeek / dueNotPlaced read as "already on the board". */
export function toExistingAssignments(rows: BoardAssignment[], items: BoardItem[]): ExistingAssignment[] {
  const kindById = new Map(items.map((i) => [i.id, i.kind as ItemKind]));
  return rows.map((r) => ({
    item_id: r.item_id,
    date: r.date,
    half: r.half,
    status: r.status,
    // Same default the build uses for an item it cannot find.
    itemKind: kindById.get(r.item_id) ?? "constant",
  }));
}

// Dates ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

/** "Oct 26". Worked out from the string, never through Date, so no time zone can shift it. */
export function shortDate(date: string): string {
  const { month, day } = parts(date);
  return `${MONTHS[month - 1]} ${day}`;
}

function weekdayShort(weekday: number): string {
  return STORE_WEEKDAYS.find((d) => d.value === weekday)?.short ?? "";
}

/** "Mon Oct 26". */
export function dayLabel(date: string): string {
  return `${weekdayShort(isoWeekday(date))} ${shortDate(date)}`;
}

/** "Monday, Oct 26". */
export function longDayLabel(date: string): string {
  const name = LONG_DAYS[isoWeekday(date) - 1] ?? "";
  return `${name}, ${shortDate(date)}`;
}

/** "Oct 26 to Oct 31", or with the year for the printed sheet. */
export function weekRangeLabel(weekStart: string, options: { year?: boolean } = {}): string {
  const end = addDays(weekStart, 5);
  const start = parts(weekStart);
  const last = parts(end);
  if (!options.year) return `${shortDate(weekStart)} to ${shortDate(end)}`;
  // A week that crosses New Year's needs both years to read right.
  const crossesYear = start.year !== last.year;
  const first = crossesYear ? `${shortDate(weekStart)}, ${start.year}` : shortDate(weekStart);
  return `${first} to ${shortDate(end)}, ${last.year}`;
}

export function weekdayDate(weekStart: string, weekday: number): string {
  return addDays(weekStart, weekday - 1);
}

export function weekToggleStarts(thisWeekStart: string): { thisWeek: string; nextWeek: string } {
  return { thisWeek: thisWeekStart, nextWeek: addDays(thisWeekStart, 7) };
}

/** ?day=1..6, anything else is ignored. */
export function parseDayParam(raw: string | undefined | null): number | null {
  if (!raw || !/^[1-6]$/.test(raw)) return null;
  return Number(raw);
}

/**
 * The day the board opens on: the one in the link, else today when today is
 * inside the week, else Monday. Sunday is never inside a week (the store is
 * closed), so it lands on Monday too.
 */
export function openingWeekday(weekStart: string, today: string, dayParam: number | null): number {
  if (dayParam !== null) return dayParam;
  const inWeek = today >= weekStart && today <= addDays(weekStart, 5);
  return inWeek ? isoWeekday(today) : 1;
}

// Cards ---------------------------------------------------------------------------

export interface BoardTag {
  label: string;
  tone: Tone;
}

export interface BoardCard {
  id: string;
  itemId: string;
  name: string;
  zoneId: string;
  zoneName: string;
  zoneColor: string;
  zoneSide: string;
  zoneSort: number;
  itemSort: number;
  kind: ItemKind;
  date: string;
  half: SlotHalf;
  origin: Origin;
  status: AssignmentStatus;
  skipReason: string | null;
  tags: BoardTag[];
}

/** Origin and skip tags (plan "Missed" and "Skip"). Constants and auto-placed cleans carry none. */
export function cardTags(origin: Origin, status: AssignmentStatus, skipReason: string | null): BoardTag[] {
  const tags: BoardTag[] = [];
  if (origin === "carry_over") tags.push({ label: "Carried over", tone: "warning" });
  if (origin === "redo") tags.push({ label: "Redo", tone: "danger" });
  if (origin === "manual") tags.push({ label: "Added", tone: "info" });
  if (status === "skipped") {
    tags.push({ label: skipReason ? `Skipped: ${skipReason}` : "Skipped", tone: "warning" });
  }
  return tags;
}

/**
 * The status chip. A planned clean shows none (that is the normal state) and
 * a skipped one is already covered by its "Skipped: reason" tag.
 */
export function statusInfo(status: AssignmentStatus): { label: string; tone: Tone } | null {
  switch (status) {
    case "done":
      return { label: "Done", tone: "success" };
    case "not_needed":
      return { label: "Checked, not needed", tone: "success" };
    case "missed":
      return { label: "Missed", tone: "danger" };
    default:
      return null;
  }
}

/** Only a planned clean can move, be skipped, or be removed. */
export function isMovable(card: Pick<BoardCard, "status">): boolean {
  return card.status === "planned";
}

/** Constants cannot be removed, only skipped (plan "Weekly plan"). */
export function isRemovable(card: Pick<BoardCard, "status" | "origin">): boolean {
  return card.status === "planned" && card.origin !== "constant";
}

/** A mistaken skip can be undone. */
export function isRestorable(card: Pick<BoardCard, "status">): boolean {
  return card.status === "skipped";
}

const UNKNOWN_ZONE: BoardZone = { id: "", name: "No zone", color: "#9CA3AF", side: "boh", sort: 999 };

function compareCards(a: BoardCard, b: BoardCard): number {
  // Constants first, then variables (plan "How a week runs" step 2).
  const rank = (c: BoardCard) => (c.kind === "constant" ? 0 : 1);
  return (
    rank(a) - rank(b) ||
    a.zoneSort - b.zoneSort ||
    a.itemSort - b.itemSort ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id)
  );
}

export function buildCards(assignments: BoardAssignment[], items: BoardItem[], zones: BoardZone[]): BoardCard[] {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  return assignments
    .map((a): BoardCard => {
      const item = itemById.get(a.item_id);
      const zone = (item && zoneById.get(item.zone_id)) || UNKNOWN_ZONE;
      return {
        id: a.id,
        itemId: a.item_id,
        name: item?.name ?? "Unknown item",
        zoneId: zone.id,
        zoneName: zone.name,
        zoneColor: zone.color,
        zoneSide: zone.side,
        zoneSort: zone.sort,
        itemSort: item?.sort ?? 0,
        kind: (item?.kind as ItemKind | undefined) ?? "constant",
        date: a.date,
        half: a.half,
        origin: a.origin,
        status: a.status,
        skipReason: a.skip_reason,
        tags: cardTags(a.origin, a.status, a.skip_reason),
      };
    })
    .sort(compareCards);
}

// Load versus cap -----------------------------------------------------------------

/** Keyed "weekday|half", like loadSlotCaps, as a plain object so it crosses to the client. */
export type CapRecord = Record<string, number>;

export interface SlotLoad {
  /** Variable cleans in the slot. Skipped ones are excluded, as planWeek excludes them. */
  load: number;
  cap: number;
  state: "open" | "full" | "over";
  label: string;
}

/**
 * The slot's variable load against its cap. Adding past the cap is allowed
 * (a planner override), it just reads "over". A missing cap counts as 0, the
 * same rule planWeek uses.
 */
export function slotLoad(cards: BoardCard[], weekday: number, half: SlotHalf, caps: CapRecord): SlotLoad {
  const load = cards.filter((c) => c.kind === "variable" && c.status !== "skipped").length;
  const cap = caps[`${weekday}|${half}`] ?? 0;
  const state = load > cap ? "over" : load === cap ? "full" : "open";
  const base = `Variables ${load} of ${cap}`;
  return { load, cap, state, label: state === "over" ? `${base}, over the cap` : base };
}

// Days and halves -----------------------------------------------------------------

export interface SlotView {
  half: SlotHalf;
  cards: BoardCard[];
  variables: SlotLoad;
}

export interface DayView {
  date: string;
  weekday: number;
  short: string;
  /** Day of the month, for the chip. */
  dayOfMonth: number;
  label: string;
  longLabel: string;
  /** Cleans on the day, skipped ones left out. */
  count: number;
  am: SlotView;
  pm: SlotView;
}

/** The six store days of a week, Monday to Saturday. */
export function weekDays(weekStart: string): { date: string; weekday: number; short: string; dayOfMonth: number }[] {
  return STORE_WEEKDAYS.map(({ value, short }) => {
    const date = weekdayDate(weekStart, value);
    return { date, weekday: value, short, dayOfMonth: parts(date).day };
  });
}

export interface WeekViewInput {
  weekStart: string;
  assignments: BoardAssignment[];
  items: BoardItem[];
  zones: BoardZone[];
  caps: CapRecord;
  /** Drop cards before grouping, for example the print sheet's side filter. */
  include?: (card: BoardCard) => boolean;
}

/**
 * Groups the week's cards by day and half, constants first, and counts each
 * day. The same shape feeds the board and the print table.
 */
export function buildWeekView(input: WeekViewInput): DayView[] {
  const all = buildCards(input.assignments, input.items, input.zones);
  const cards = input.include ? all.filter(input.include) : all;
  return weekDays(input.weekStart).map((day) => {
    const dayCards = cards.filter((c) => c.date === day.date);
    const slot = (half: SlotHalf): SlotView => {
      const slotCards = dayCards.filter((c) => c.half === half);
      return { half, cards: slotCards, variables: slotLoad(slotCards, day.weekday, half, input.caps) };
    };
    return {
      ...day,
      label: dayLabel(day.date),
      longLabel: longDayLabel(day.date),
      count: dayCards.filter((c) => c.status !== "skipped").length,
      am: slot("am"),
      pm: slot("pm"),
    };
  });
}

// Tray and pull picker ------------------------------------------------------------

export interface TrayRow {
  itemId: string;
  name: string;
  zoneName: string;
  zoneColor: string;
  cadence: string;
}

/** The "due, not placed" ids (most overdue first) as rows. An id with no item is dropped. */
export function trayRows(
  ids: string[],
  items: (BoardItem & { half: string; days_of_week: number[] | null; interval_weeks: number | null })[],
  zones: BoardZone[],
): TrayRow[] {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const rows: TrayRow[] = [];
  for (const id of ids) {
    const item = itemById.get(id);
    if (!item) continue;
    const zone = zoneById.get(item.zone_id) ?? UNKNOWN_ZONE;
    rows.push({ itemId: id, name: item.name, zoneName: zone.name, zoneColor: zone.color, cadence: cadenceLabel(item) });
  }
  return rows;
}

export interface PullItem {
  id: string;
  name: string;
  zoneName: string;
  zoneColor: string;
  zoneSort: number;
  itemSort: number;
  cadence: string;
  /** The half the item is set to, when it has one; "either" has no favorite. */
  half: string;
}

/**
 * Active items in active zones only (what loadPlanItems returns), with their
 * zone, ready for the picker. Drafts and retired items never appear.
 */
export function buildPullItems(
  activePlanItems: PlanItem[],
  items: (BoardItem & { half: string; days_of_week: number[] | null; interval_weeks: number | null })[],
  zones: BoardZone[],
): PullItem[] {
  const activeIds = new Set(activePlanItems.map((p) => p.id));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  return items
    .filter((i) => activeIds.has(i.id))
    .map((i): PullItem => {
      const zone = zoneById.get(i.zone_id) ?? UNKNOWN_ZONE;
      return {
        id: i.id,
        name: i.name,
        zoneName: zone.name,
        zoneColor: zone.color,
        zoneSort: zone.sort,
        itemSort: i.sort,
        cadence: cadenceLabel(i),
        half: i.half,
      };
    })
    .sort((a, b) => a.zoneSort - b.zoneSort || a.itemSort - b.itemSort || a.name.localeCompare(b.name));
}

/** Case-insensitive match on the item name or its zone name. An empty query matches everything. */
export function filterPullItems(items: PullItem[], query: string): PullItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.name.toLowerCase().includes(q) || i.zoneName.toLowerCase().includes(q));
}

/** "Add to Tue AM". */
export function addLabel(date: string, half: SlotHalf): string {
  return `Add to ${weekdayShort(isoWeekday(date))} ${half.toUpperCase()}`;
}

/** The sheet and picker disable days that already passed: a clean placed there would count as missed. */
export function isPastDay(date: string, today: string): boolean {
  return date < today;
}
