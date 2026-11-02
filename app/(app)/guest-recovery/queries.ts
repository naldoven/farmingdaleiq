import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecoveryStatus, SendChannel, SendStatus } from "@/app/(app)/guest-recovery/constants";
import type { MenuItemView, RecoveryView, WorkerView } from "@/app/(app)/guest-recovery/types";
import type { Database } from "@/lib/db/types";

type Client = SupabaseClient<Database>;

type RecoveryRow = Database["public"]["Tables"]["guest_recoveries"]["Row"];
type HydrateRow = Pick<
  RecoveryRow,
  | "id"
  | "token"
  | "guest_name"
  | "guest_email"
  | "guest_phone"
  | "order_number"
  | "note"
  | "sms_consent"
  | "status"
  | "logged_by"
  | "created_at"
  | "given_at"
  | "voided_at"
  | "reason"
  | "path"
  | "expires_at"
  | "assigned_to"
>;

const RECOVERY_COLUMNS =
  "id, token, guest_name, guest_email, guest_phone, order_number, note, sms_consent, status, logged_by, created_at, given_at, voided_at, reason, path, expires_at, assigned_to";

/** Handed-over and voided recoveries stay on the list this long. */
const RECENT_DAYS = 30;
const RECENT_LIMIT = 100;
/** Supabase silently caps a fetch at 1000 rows; the still-owed list is far smaller, but stop short of it. */
const OWED_LIMIT = 500;

/**
 * Builds the views for a batch of recovery rows: items, send history and the
 * logger's name. Three batched reads, not one per recovery.
 */
async function hydrate(supabase: Client, list: HydrateRow[]): Promise<RecoveryView[]> {
  if (list.length === 0) return [];

  const ids = list.map((r) => r.id);
  const personIds = [
    ...new Set([...list.map((r) => r.logged_by), ...list.flatMap((r) => (r.assigned_to ? [r.assigned_to] : []))]),
  ];

  const [itemsResult, sendsResult, namesResult, priorResult] = await Promise.all([
    supabase.from("guest_recovery_items").select("id, recovery_id, name, family, qty").in("recovery_id", ids).order("name"),
    supabase
      .from("guest_recovery_sends")
      .select("id, recovery_id, channel, kind, status, error, created_at, sent_at")
      .in("recovery_id", ids)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, name").in("id", personIds),
    // Counts only (never contact details). A failure just hides the repeat flag.
    supabase.rpc("guest_recovery_prior_counts", { p_ids: ids }),
  ]);
  if (itemsResult.error) throw new Error(`Could not load recovery items: ${itemsResult.error.message}`);
  if (sendsResult.error) throw new Error(`Could not load recovery sends: ${sendsResult.error.message}`);

  const names = new Map((namesResult.data ?? []).map((p) => [p.id, p.name]));
  const priors = new Map((priorResult.data ?? []).map((row) => [row.out_id, row.out_prior]));

  return list.map((r) => ({
    id: r.id,
    token: r.token,
    guestName: r.guest_name,
    guestEmail: r.guest_email,
    guestPhone: r.guest_phone,
    orderNumber: r.order_number,
    note: r.note,
    smsConsent: r.sms_consent,
    status: r.status as RecoveryStatus,
    loggedBy: r.logged_by,
    loggedByName: names.get(r.logged_by) ?? "Former team member",
    createdAt: r.created_at,
    givenAt: r.given_at,
    voidedAt: r.voided_at,
    reason: r.reason,
    path: r.path === "spotlight" ? "spotlight" : "standard",
    expiresAt: r.expires_at,
    assignedTo: r.assigned_to,
    assignedToName: r.assigned_to ? (names.get(r.assigned_to) ?? "Former team member") : null,
    priorCount: priors.get(r.id) ?? 0,
    items: (itemsResult.data ?? [])
      .filter((i) => i.recovery_id === r.id)
      .map((i) => ({ id: i.id, name: i.name, family: i.family, qty: i.qty })),
    sends: (sendsResult.data ?? [])
      .filter((s) => s.recovery_id === r.id)
      .map((s) => ({
        id: s.id,
        channel: s.channel as SendChannel,
        kind: s.kind as "initial" | "resend",
        status: s.status as SendStatus,
        error: s.error,
        createdAt: s.created_at,
        sentAt: s.sent_at,
      })),
  }));
}

export interface RecoveryList {
  owed: RecoveryView[];
  recent: RecoveryView[];
}

/** Still owed (oldest first, so the longest wait is on top) and recently closed ones. */
export async function loadRecoveryList(supabase: Client, now: Date = new Date()): Promise<RecoveryList> {
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString();
  const [owed, recent] = await Promise.all([
    supabase
      .from("guest_recoveries")
      .select(RECOVERY_COLUMNS)
      .eq("status", "owed")
      .order("created_at", { ascending: true })
      .limit(OWED_LIMIT),
    supabase
      .from("guest_recoveries")
      .select(RECOVERY_COLUMNS)
      .neq("status", "owed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT),
  ]);
  if (owed.error) throw new Error(`Could not load recoveries: ${owed.error.message}`);
  if (recent.error) throw new Error(`Could not load recoveries: ${recent.error.message}`);
  const [owedViews, recentViews] = await Promise.all([
    hydrate(supabase, (owed.data ?? []) as HydrateRow[]),
    hydrate(supabase, (recent.data ?? []) as HydrateRow[]),
  ]);
  return { owed: owedViews, recent: recentViews };
}

export async function loadRecovery(supabase: Client, id: string): Promise<RecoveryView | null> {
  const { data, error } = await supabase.from("guest_recoveries").select(RECOVERY_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load the recovery: ${error.message}`);
  if (!data) return null;
  const [view] = await hydrate(supabase, [data as HydrateRow]);
  return view ?? null;
}

/** The leader's own lookup of a scanned code. RLS limits it to guest_recovery.log holders. */
export async function loadRecoveryIdByToken(supabase: Client, token: string): Promise<string | null> {
  const { data } = await supabase.from("guest_recoveries").select("id").eq("token", token).maybeSingle();
  return data?.id ?? null;
}

/** The menu for the log form: active items only, in menu order. */
export async function loadActiveMenu(supabase: Client): Promise<MenuItemView[]> {
  const { data, error } = await supabase
    .from("recovery_menu_items")
    .select("id, name, family, category, sort, active")
    .eq("active", true)
    .order("sort");
  if (error) throw new Error(`Could not load the menu: ${error.message}`);
  return data ?? [];
}

/**
 * The people a Spotlight recovery can be handed to: active profiles whose role
 * holds guest_recovery.log. Names only.
 */
export async function loadWorkers(supabase: Client): Promise<WorkerView[]> {
  const { data: perms, error: permError } = await supabase
    .from("role_permissions")
    .select("role_id")
    .eq("permission_key", "guest_recovery.log");
  if (permError) throw new Error(`Could not load roles: ${permError.message}`);
  const roleIds = (perms ?? []).map((p) => p.role_id);
  if (roleIds.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .in("role_id", roleIds)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(`Could not load people: ${error.message}`);
  return data ?? [];
}

export interface RecoverySettingsView {
  expiryDays: number;
  overseerId: string | null;
  backupId: string | null;
  overseerOff: boolean;
  overseerName: string | null;
}

export async function loadRecoverySettings(supabase: Client): Promise<RecoverySettingsView> {
  const { data, error } = await supabase
    .from("guest_recovery_settings")
    .select("expiry_days, overseer_id, backup_id, overseer_off")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Could not load settings: ${error.message}`);

  let overseerName: string | null = null;
  if (data?.overseer_id) {
    const { data: person } = await supabase.from("profiles").select("name").eq("id", data.overseer_id).maybeSingle();
    overseerName = person?.name ?? null;
  }
  return {
    expiryDays: data?.expiry_days ?? 90,
    overseerId: data?.overseer_id ?? null,
    backupId: data?.backup_id ?? null,
    overseerOff: data?.overseer_off ?? false,
    overseerName,
  };
}
