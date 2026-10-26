import type { SupabaseClient } from "@supabase/supabase-js";

import { PermissionError } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/types";
import { storeLocalNow } from "@/app/(app)/checklists/logic";
import { PHOTO_BUCKET } from "@/app/(app)/cleaning/constants";
import { addDays, lastDoneDates } from "@/app/(app)/cleaning/week-logic";

type Client = SupabaseClient<Database>;

export type ZoneRow = Database["public"]["Tables"]["cleaning_zones"]["Row"];
export type ItemRow = Database["public"]["Tables"]["cleaning_items"]["Row"];
export type PhotoRow = Database["public"]["Tables"]["cleaning_item_photos"]["Row"];

/**
 * Planning rights come from the cleaning.plan key OR the coordinator tag
 * (supabase/migrations/20261026000000_cleaning_walkthrough.sql
 * can_plan_cleaning), so the plain hasPermission() check is not enough here.
 * Fails closed on any error, like hasPermission.
 */
export async function canPlanCleaning(supabase: Client): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("can_plan_cleaning");
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

export async function requireCleaningPlanner(supabase: Client): Promise<void> {
  if (!(await canPlanCleaning(supabase))) {
    throw new PermissionError("cleaning.plan");
  }
}

export async function loadZones(supabase: Client): Promise<ZoneRow[]> {
  const { data, error } = await supabase.from("cleaning_zones").select("*").order("sort");
  if (error) throw new Error(`Could not load zones: ${error.message}`);
  return data ?? [];
}

export async function loadItems(supabase: Client, statuses: ItemRow["status"][]): Promise<ItemRow[]> {
  const { data, error } = await supabase
    .from("cleaning_items")
    .select("*")
    .in("status", statuses)
    .order("sort")
    .order("created_at");
  if (error) throw new Error(`Could not load the master list: ${error.message}`);
  return data ?? [];
}

/** Newest photo per item. One query, not one per item. */
export async function loadLatestPhotos(supabase: Client, itemIds: string[]): Promise<Map<string, PhotoRow>> {
  const latest = new Map<string, PhotoRow>();
  if (itemIds.length === 0) return latest;
  const { data, error } = await supabase
    .from("cleaning_item_photos")
    .select("*")
    .in("item_id", itemIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load photos: ${error.message}`);
  for (const photo of data ?? []) {
    if (!latest.has(photo.item_id)) latest.set(photo.item_id, photo);
  }
  return latest;
}

/**
 * Signed URLs for many photos in ONE call. The Quote Tool signed photos one
 * at a time and got null back for 22 to 76 of 361 under load (journal
 * 2026-10-09, #2168); the batched call does not have that failure. A missing
 * entry renders as "photo unavailable", never as a crash.
 */
export async function signPhotoUrls(supabase: Client, paths: string[], ttlSeconds = 3600): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, ttlSeconds);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

export type AssignmentRow = Database["public"]["Tables"]["cleaning_assignments"]["Row"];
export type WeekRow = Database["public"]["Tables"]["cleaning_weeks"]["Row"];

export interface StoreClock {
  /** Store-local "YYYY-MM-DD". */
  today: string;
  /** Store-local "HH:MM:SS". */
  timeOfDay: string;
  timeZone: string;
}

/**
 * Store-local today, never the server clock (FIQ-12): Vercel runs in UTC, and
 * from 8pm Eastern the UTC date is already tomorrow.
 */
export async function loadStoreClock(supabase: Client, now = new Date()): Promise<StoreClock> {
  const { data: store } = await supabase.from("stores").select("timezone").limit(1).maybeSingle();
  const timeZone = store?.timezone || "America/New_York";
  const { date, timeOfDay } = storeLocalNow(now, timeZone);
  return { today: date, timeOfDay, timeZone };
}

/** Keyed "weekday|half", the shape planWeek reads. */
export async function loadSlotCaps(supabase: Client): Promise<Map<string, number>> {
  const { data, error } = await supabase.from("cleaning_slot_caps").select("*");
  if (error) throw new Error(`Could not load slot caps: ${error.message}`);
  return new Map((data ?? []).map((c) => [`${c.weekday}|${c.half}`, c.max_variables]));
}

/** Store-local date of each item's last counted clean. */
export async function loadLastDone(supabase: Client, timeZone: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("cleaning_item_last_done").select("*");
  if (error) throw new Error(`Could not load last-cleaned dates: ${error.message}`);
  return lastDoneDates(data ?? [], timeZone);
}

export async function loadWeek(supabase: Client, weekStart: string): Promise<WeekRow | null> {
  const { data, error } = await supabase.from("cleaning_weeks").select("*").eq("week_start", weekStart).maybeSingle();
  if (error) throw new Error(`Could not load the week: ${error.message}`);
  return data;
}

export async function loadWeekAssignments(supabase: Client, weekStart: string): Promise<AssignmentRow[]> {
  const { data, error } = await supabase
    .from("cleaning_assignments")
    .select("*")
    .eq("week_start", weekStart)
    .order("date")
    .order("half")
    .order("created_at");
  if (error) throw new Error(`Could not load the week's cleans: ${error.message}`);
  return data ?? [];
}

/**
 * Cleans still open in weeks before `weekStart`, for projectLastDone: next
 * week's build and tray must count them as coming. No date filter: one left
 * open on an ended day is either finished before the 3am close or carried
 * over by it, so it is coming either way.
 */
export async function loadPlannedBefore(
  supabase: Client,
  weekStart: string,
): Promise<{ item_id: string; date: string }[]> {
  const { data, error } = await supabase
    .from("cleaning_assignments")
    .select("item_id, date")
    .eq("status", "planned")
    .lt("week_start", weekStart);
  if (error) throw new Error(`Could not load open cleans: ${error.message}`);
  return data ?? [];
}

const PAGE = 1000;

/**
 * Every clean dated between `from` and `to`, inclusive. Paged: Supabase
 * silently stops at 1000 rows, and a month of BOH plus FOH cleans can pass
 * that.
 */
export async function loadAssignmentsBetween(supabase: Client, from: string, to: string): Promise<AssignmentRow[]> {
  const rows: AssignmentRow[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await supabase
      .from("cleaning_assignments")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("id")
      .range(start, start + PAGE - 1);
    if (error) throw new Error(`Could not load cleans: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * Who led each half-day: the leader on that date's posted Morning (AM) or
 * Closing (PM) Setup, the same rule close_cleaning_days uses for misses.
 * Keyed "date|half". When a day part was posted twice, the latest post wins.
 */
export async function loadSetupOwners(supabase: Client, from: string, to: string): Promise<Map<string, string>> {
  const [{ data: parts, error: partError }, { data: setups, error: setupError }] = await Promise.all([
    supabase.from("day_parts").select("id, name").in("name", ["Morning", "Closing"]),
    supabase
      .from("setups")
      .select("date, day_part_id, shift_leader_id, posted_at")
      .gte("date", from)
      .lte("date", to)
      .not("posted_at", "is", null)
      .order("posted_at"),
  ]);
  if (partError) throw new Error(`Could not load day parts: ${partError.message}`);
  if (setupError) throw new Error(`Could not load Setups: ${setupError.message}`);
  const halfByPart = new Map((parts ?? []).map((p) => [p.id, p.name === "Morning" ? "am" : "pm"]));
  const owners = new Map<string, string>();
  for (const setup of setups ?? []) {
    const half = setup.day_part_id ? halfByPart.get(setup.day_part_id) : undefined;
    if (half && setup.shift_leader_id) owners.set(`${setup.date}|${half}`, setup.shift_leader_id);
  }
  return owners;
}

/**
 * Carry-overs dated in a window after a period, for leaderStats: a miss on
 * the period's last day carries into the next one. A week covers a late
 * close and a weekend.
 */
export async function loadCarriesAfter(
  supabase: Client,
  periodEnd: string,
): Promise<{ carried_from_id: string | null }[]> {
  const { data, error } = await supabase
    .from("cleaning_assignments")
    .select("carried_from_id")
    .eq("origin", "carry_over")
    .gt("date", periodEnd)
    .lte("date", addDays(periodEnd, 7));
  if (error) throw new Error(`Could not load carry-overs: ${error.message}`);
  return data ?? [];
}
