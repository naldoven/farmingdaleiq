import { addDays, isoWeekday, type SlotHalf } from "@/app/(app)/cleaning/week-logic";
import { formatStoreTime } from "@/lib/time";

/**
 * Pure shaping for the Today screen (docs/CLEANING-PLAN.md "Screens": `/cleaning`).
 * Takes the week's rows plus the lookups the page already loaded and returns
 * what the screen draws, so grouping, sorting and wording are tested without
 * Supabase or React. Dates are store-local "YYYY-MM-DD" strings; weekday math
 * runs on UTC midnights through week-logic, so a daylight-saving week cannot
 * shift a label.
 */

export type CardStatus = "planned" | "done" | "not_needed" | "skipped" | "missed";

/** The assignment columns the screen reads. A structural subset of the table row. */
export interface AssignmentLike {
  id: string;
  item_id: string;
  date: string;
  half: string;
  origin: string;
  carried_from_id: string | null;
  status: string;
  skip_reason: string | null;
  completed_by: string | null;
  completed_at: string | null;
  photo_path: string | null;
  rejected_at: string | null;
  reject_note: string | null;
}

export interface ItemLike {
  id: string;
  name: string;
  kind: string;
  if_needed: boolean;
  zone_id: string;
  sort: number;
}

export interface ZoneLike {
  id: string;
  name: string;
  color: string;
  sort: number;
}

/** What a carry-over or redo row remembers about the clean it came from. */
export interface SourceInfo {
  date: string;
  reject_note: string | null;
}

export type TagKind = "carry" | "redo" | "if_needed";

export interface CardTag {
  kind: TagKind;
  text: string;
}

export type StatusTone = "success" | "warning" | "danger" | "neutral";

export interface TodayCard {
  id: string;
  itemName: string;
  zoneName: string;
  zoneColor: string;
  date: string;
  half: SlotHalf;
  ifNeeded: boolean;
  tags: CardTag[];
  status: CardStatus;
  /** The status line. Null for a planned clean, which shows its buttons instead. */
  statusText: string | null;
  statusTone: StatusTone;
  /** Who and when, under "Checked, not needed". */
  detailText: string | null;
  photoUrl: string | null;
  /** The clean has a photo but its signed URL did not come back. */
  photoMissing: boolean;
  /** "Rejected: <note>" once a planner has sent it back. */
  rejectedText: string | null;
  canReject: boolean;
}

export interface TodayDayGroup {
  date: string;
  /** "Wed Oct 28". */
  label: string;
  cards: TodayCard[];
}

export interface TodayView {
  /** Sunday: the store is closed and the screen previews Monday. */
  closed: boolean;
  /** Today's date for the header, "Monday, Oct 26". */
  dateLabel: string;
  /** The day the AM and PM sections show: today, or Monday on a Sunday. */
  focusDate: string;
  focusLabel: string;
  am: TodayCard[];
  pm: TodayCard[];
  later: TodayDayGroup[];
  laterCount: number;
  /**
   * Last night's cleans still open after midnight. The day-end close waits
   * until 3am, so the closing shift can finish and photograph them.
   */
  stillOpen: TodayCard[];
}

export interface TodayViewInput {
  /** Store-local today. */
  today: string;
  assignments: AssignmentLike[];
  items: Map<string, ItemLike>;
  zones: Map<string, ZoneLike>;
  /** Profile id to full name. */
  people: Map<string, string>;
  /** Storage path to signed URL. */
  photoUrls: Map<string, string>;
  /** Keyed by the assignment id a carry-over or redo points back to. */
  sources: Map<string, SourceInfo>;
  canPlan: boolean;
  /** Planned cleans dated before today that the day-end close has not reached yet. */
  stillOpen?: AssignmentLike[];
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Wed". */
export function weekdayShort(date: string): string {
  return WEEKDAY_SHORT[isoWeekday(date) - 1]!;
}

function monthDay(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTH_SHORT[month! - 1]} ${day}`;
}

/** "Wednesday, Oct 28". */
export function longDateLabel(date: string): string {
  return `${WEEKDAY_LONG[isoWeekday(date) - 1]}, ${monthDay(date)}`;
}

/** "Wed Oct 28". */
export function shortDateLabel(date: string): string {
  return `${weekdayShort(date)} ${monthDay(date)}`;
}

export function isClosedDay(date: string): boolean {
  return isoWeekday(date) === 7;
}

/** Sunday looks ahead to Monday's list; every other day shows itself. */
export function focusDate(today: string): string {
  return isClosedDay(today) ? addDays(today, 1) : today;
}

/**
 * The rows the screen draws: the focus day, plus planned cleans later in the
 * week. A closed Sunday previews Monday only, so nothing else is kept.
 */
export function visibleAssignments<T extends Pick<AssignmentLike, "date" | "status">>(today: string, rows: T[]): T[] {
  const focus = focusDate(today);
  const closed = isClosedDay(today);
  return rows.filter((row) => row.date === focus || (!closed && row.date > today && row.status === "planned"));
}

/**
 * Ids a carry-over or redo points back to that are not in `known`. The page
 * looks these up in one extra query: a Saturday miss carries into the next
 * week's Monday, so its source sits in the week before.
 */
export function missingSourceIds(rows: AssignmentLike[], known: Pick<AssignmentLike, "id">[]): string[] {
  const have = new Set(known.map((row) => row.id));
  const missing = new Set<string>();
  for (const row of rows) {
    if ((row.origin === "carry_over" || row.origin === "redo") && row.carried_from_id && !have.has(row.carried_from_id)) {
      missing.add(row.carried_from_id);
    }
  }
  return [...missing];
}

/** "Maria Lopez" to "Maria". Null when there is no usable name. */
export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function cardTags(row: AssignmentLike, ifNeeded: boolean, sources: Map<string, SourceInfo>): CardTag[] {
  const source = row.carried_from_id ? sources.get(row.carried_from_id) : undefined;
  const tags: CardTag[] = [];
  if (row.origin === "carry_over") {
    tags.push({ kind: "carry", text: source ? `Carried over from ${weekdayShort(source.date)}` : "Carried over" });
  } else if (row.origin === "redo") {
    const note = source?.reject_note?.trim();
    tags.push({ kind: "redo", text: note ? `Redo: ${note}` : "Redo" });
  }
  if (ifNeeded) tags.push({ kind: "if_needed", text: "If needed" });
  return tags;
}

function asHalf(value: string): SlotHalf {
  return value === "pm" ? "pm" : "am";
}

function whoAndWhen(row: AssignmentLike, people: Map<string, string>): { who: string | null; when: string | null } {
  const who = firstName(row.completed_by ? people.get(row.completed_by) : null);
  const when = row.completed_at ? formatStoreTime(row.completed_at, "") : "";
  return { who, when: when || null };
}

function statusFor(
  row: AssignmentLike,
  people: Map<string, string>,
): Pick<TodayCard, "statusText" | "statusTone" | "detailText"> {
  switch (row.status) {
    case "done": {
      const { who, when } = whoAndWhen(row, people);
      const by = who ? ` by ${who}` : "";
      const at = when ? `, ${when}` : "";
      return { statusText: `Done${by}${at}`, statusTone: "success", detailText: null };
    }
    case "not_needed": {
      const { who, when } = whoAndWhen(row, people);
      const detail = [who, when].filter(Boolean).join(", ");
      return { statusText: "Checked, not needed", statusTone: "success", detailText: detail || null };
    }
    case "skipped":
      return { statusText: `Skipped: ${row.skip_reason?.trim() || "no reason given"}`, statusTone: "warning", detailText: null };
    case "missed":
      return { statusText: "Missed", statusTone: "danger", detailText: null };
    default:
      return { statusText: null, statusTone: "neutral", detailText: null };
  }
}

interface Entry {
  row: AssignmentLike;
  item: ItemLike | undefined;
  zone: ZoneLike | undefined;
}

/**
 * Constants first (the fixed weekly cleans every leader knows), then the
 * rest; inside each, zone order, then the master list's own order. Nothing
 * here depends on status, so a card stays where it is when it is completed.
 */
function compareEntries(a: Entry, b: Entry): number {
  const rank = (e: Entry) => (e.item?.kind === "constant" ? 0 : 1);
  return (
    rank(a) - rank(b) ||
    (a.zone?.sort ?? 0) - (b.zone?.sort ?? 0) ||
    (a.item?.sort ?? 0) - (b.item?.sort ?? 0) ||
    (a.item?.name ?? "").localeCompare(b.item?.name ?? "") ||
    a.row.id.localeCompare(b.row.id)
  );
}

function toCard(entry: Entry, input: TodayViewInput, interactive: boolean): TodayCard {
  const { row, item, zone } = entry;
  const status = row.status as CardStatus;
  const rejected = Boolean(row.rejected_at);
  const hasPhoto = Boolean(row.photo_path);
  const photoUrl = row.photo_path ? (input.photoUrls.get(row.photo_path) ?? null) : null;
  return {
    id: row.id,
    itemName: item?.name ?? "Cleaning item",
    zoneName: zone?.name ?? "No zone",
    zoneColor: zone?.color ?? "#9CA3AF",
    date: row.date,
    half: asHalf(row.half),
    ifNeeded: item?.if_needed ?? false,
    tags: cardTags(row, item?.if_needed ?? false, input.sources),
    status,
    ...statusFor(row, input.people),
    photoUrl,
    photoMissing: hasPhoto && !photoUrl,
    rejectedText: rejected ? `Rejected: ${row.reject_note?.trim() || "sent back for a redo"}` : null,
    canReject: input.canPlan && interactive && (status === "done" || status === "not_needed") && !rejected,
  };
}

export function buildTodayView(input: TodayViewInput): TodayView {
  const closed = isClosedDay(input.today);
  const focus = focusDate(input.today);
  const entries: Entry[] = visibleAssignments(input.today, input.assignments).map((row) => ({
    row,
    item: input.items.get(row.item_id),
    zone: input.zones.get(input.items.get(row.item_id)?.zone_id ?? ""),
  }));
  entries.sort(compareEntries);

  // A Sunday preview is read only: nobody completes or rejects a clean on a
  // day the store is closed.
  const interactive = !closed;
  const cardsFor = (date: string, half?: SlotHalf) =>
    entries
      .filter((e) => e.row.date === date && (half === undefined || asHalf(e.row.half) === half))
      .map((e) => toCard(e, input, interactive));

  const laterDates = [...new Set(entries.filter((e) => e.row.date > focus).map((e) => e.row.date))].sort();
  const later: TodayDayGroup[] = laterDates.map((date) => ({
    date,
    label: shortDateLabel(date),
    // AM before PM inside a day, each half still in the screen's sort order.
    cards: [...cardsFor(date, "am"), ...cardsFor(date, "pm")],
  }));

  return {
    closed,
    dateLabel: longDateLabel(input.today),
    focusDate: focus,
    focusLabel: longDateLabel(focus),
    am: cardsFor(focus, "am"),
    pm: cardsFor(focus, "pm"),
    later,
    laterCount: later.reduce((sum, group) => sum + group.cards.length, 0),
    // Interactive even on a Sunday: this is Saturday night's list.
    stillOpen: (input.stillOpen ?? [])
      .filter((row) => row.date < input.today && row.status === "planned")
      .map((row) => ({
        row,
        item: input.items.get(row.item_id),
        zone: input.zones.get(input.items.get(row.item_id)?.zone_id ?? ""),
      }))
      .sort(compareEntries)
      .map((e) => toCard(e, input, true)),
  };
}

/**
 * "2 of 5 done" for a section. Skipped cleans are not owed today and a
 * rejected one has a redo of its own on a later shift, so neither counts.
 * Empty string when nothing is owed.
 */
export function progressText(cards: TodayCard[]): string {
  const owed = cards.filter((c) => c.status !== "skipped" && !c.rejectedText);
  if (owed.length === 0) return "";
  const done = owed.filter((c) => c.status === "done" || c.status === "not_needed").length;
  return `${done} of ${owed.length} done`;
}
