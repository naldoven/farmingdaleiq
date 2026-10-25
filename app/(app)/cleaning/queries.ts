import type { SupabaseClient } from "@supabase/supabase-js";

import { PermissionError } from "@/lib/auth/permissions";
import type { Database } from "@/lib/db/types";
import { PHOTO_BUCKET } from "@/app/(app)/cleaning/constants";

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
