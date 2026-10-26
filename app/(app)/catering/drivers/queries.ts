import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ACTIVE_DELIVERY_STAGES,
  CAR_SIZES,
  DELIVERY_PLATFORMS,
  REMINDER_KINDS,
  buildDriverScorecard,
  type BoardOrder,
  type CarSize,
  type DeliveryPlatform,
  type DriverScorecard,
  type ReminderKind,
  type ReminderLogRow,
} from "@/app/(app)/catering/drivers/logic";
import type { Database } from "@/lib/db/types";

/**
 * Read helpers for driver reservations. Every caller passes the per-request
 * client, so RLS (catering.view) decides what comes back. Errors throw, as in
 * app/(app)/cleaning/queries.ts, so a page fails loudly instead of showing an
 * empty list that looks like "no deliveries".
 */

type Client = SupabaseClient<Database>;

export interface RosterDriver {
  profileId: string;
  name: string;
  carSize: CarSize;
  hasRoadwayApp: boolean;
  hasEzcaterApp: boolean;
  active: boolean;
}

export interface PersonOption {
  id: string;
  name: string;
}

function asPlatform(value: string): DeliveryPlatform {
  return (DELIVERY_PLATFORMS as readonly string[]).includes(value) ? (value as DeliveryPlatform) : "roadway";
}

function asCarSize(value: string): CarSize {
  return (CAR_SIZES as readonly string[]).includes(value) ? (value as CarSize) : "small";
}

async function profileNames(supabase: Client, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, name").in("id", unique);
  if (error) throw new Error(`Could not load names: ${error.message}`);
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

/** Reserved drivers per order, with names, for any list of orders (board, kanban, dispatch, detail). */
export async function loadOrderDrivers(
  supabase: Client,
  orderIds: string[],
): Promise<Map<string, { profileId: string; name: string }[]>> {
  const byOrder = new Map<string, { profileId: string; name: string }[]>();
  if (orderIds.length === 0) return byOrder;
  const { data, error } = await supabase
    .from("catering_order_drivers")
    .select("order_id, profile_id, reserved_at")
    .in("order_id", orderIds)
    .order("reserved_at");
  if (error) throw new Error(`Could not load drivers: ${error.message}`);
  const names = await profileNames(
    supabase,
    (data ?? []).map((row) => row.profile_id),
  );
  for (const row of data ?? []) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push({ profileId: row.profile_id, name: names.get(row.profile_id) ?? "Unknown" });
    byOrder.set(row.order_id, list);
  }
  return byOrder;
}

/** Open delivery orders between two dates (inclusive), with their drivers. */
export async function loadDeliveryOrders(
  supabase: Client,
  range: { start: string; end: string },
): Promise<BoardOrder[]> {
  const { data, error } = await supabase
    .from("catering_orders")
    .select("id, guest_name, event_date, event_time, headcount, delivery_platform")
    .eq("fulfillment", "delivery")
    .in("stage", [...ACTIVE_DELIVERY_STAGES])
    .gte("event_date", range.start)
    .lte("event_date", range.end)
    .order("event_date")
    .order("event_time", { nullsFirst: false });
  if (error) throw new Error(`Could not load delivery orders: ${error.message}`);
  const rows = data ?? [];
  const drivers = await loadOrderDrivers(
    supabase,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    guestName: row.guest_name,
    eventDate: row.event_date,
    eventTime: row.event_time,
    headcount: row.headcount,
    platform: asPlatform(row.delivery_platform),
    drivers: drivers.get(row.id) ?? [],
  }));
}

/** The whole roster, active first, then by name. */
export async function loadRoster(supabase: Client): Promise<RosterDriver[]> {
  const { data, error } = await supabase
    .from("catering_drivers")
    .select("profile_id, car_size, has_roadway_app, has_ezcater_app, active");
  if (error) throw new Error(`Could not load the driver list: ${error.message}`);
  const names = await profileNames(
    supabase,
    (data ?? []).map((row) => row.profile_id),
  );
  return (data ?? [])
    .map((row) => ({
      profileId: row.profile_id,
      name: names.get(row.profile_id) ?? "Unknown",
      carSize: asCarSize(row.car_size),
      hasRoadwayApp: row.has_roadway_app,
      hasEzcaterApp: row.has_ezcater_app,
      active: row.active,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

/**
 * Everyone on a posted setup (assigned to a position or leading it) per date,
 * so the picker can list who is actually working that day first.
 */
export async function loadOnSetupByDate(supabase: Client, dates: string[]): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  if (dates.length === 0) return result;
  const { data: setups, error } = await supabase
    .from("setups")
    .select("id, date, shift_leader_id")
    .in("date", dates)
    .not("posted_at", "is", null);
  if (error) throw new Error(`Could not load setups: ${error.message}`);
  const dateBySetup = new Map((setups ?? []).map((setup) => [setup.id, setup.date]));
  const add = (date: string, id: string | null) => {
    if (!id) return;
    const list = (result[date] ??= []);
    if (!list.includes(id)) list.push(id);
  };
  for (const setup of setups ?? []) add(setup.date, setup.shift_leader_id);
  if (dateBySetup.size > 0) {
    const { data: assignments, error: assignmentError } = await supabase
      .from("setup_assignments")
      .select("setup_id, user_id")
      .in("setup_id", [...dateBySetup.keys()]);
    if (assignmentError) throw new Error(`Could not load setup assignments: ${assignmentError.message}`);
    for (const row of assignments ?? []) {
      const date = dateBySetup.get(row.setup_id);
      if (date) add(date, row.user_id);
    }
  }
  return result;
}

/** Active team members, for adding a driver or picking the escalation contact. */
export async function loadActivePeople(supabase: Client): Promise<PersonOption[]> {
  const { data, error } = await supabase.from("profiles").select("id, name").eq("active", true).order("name");
  if (error) throw new Error(`Could not load the team: ${error.message}`);
  return data ?? [];
}

export async function loadEscalationContact(supabase: Client): Promise<PersonOption | null> {
  const { data, error } = await supabase
    .from("catering_driver_settings")
    .select("escalation_profile_id")
    .maybeSingle();
  if (error) throw new Error(`Could not load driver settings: ${error.message}`);
  const id = data?.escalation_profile_id;
  if (!id) return null;
  const names = await profileNames(supabase, [id]);
  return { id, name: names.get(id) ?? "Unknown" };
}

/** The signed-in driver's open deliveries on one day, for the Home card. */
export async function loadMyDeliveries(supabase: Client, profileId: string, date: string): Promise<BoardOrder[]> {
  const { data: mine, error } = await supabase
    .from("catering_order_drivers")
    .select("order_id")
    .eq("profile_id", profileId);
  if (error) throw new Error(`Could not load your deliveries: ${error.message}`);
  const orderIds = (mine ?? []).map((row) => row.order_id);
  if (orderIds.length === 0) return [];
  const { data: orders, error: orderError } = await supabase
    .from("catering_orders")
    .select("id, guest_name, event_date, event_time, headcount, delivery_platform")
    .in("id", orderIds)
    .eq("event_date", date)
    .eq("fulfillment", "delivery")
    .in("stage", [...ACTIVE_DELIVERY_STAGES])
    .order("event_time", { nullsFirst: false });
  if (orderError) throw new Error(`Could not load your deliveries: ${orderError.message}`);
  const drivers = await loadOrderDrivers(
    supabase,
    (orders ?? []).map((row) => row.id),
  );
  return (orders ?? []).map((row) => ({
    id: row.id,
    guestName: row.guest_name,
    eventDate: row.event_date,
    eventTime: row.event_time,
    headcount: row.headcount,
    platform: asPlatform(row.delivery_platform),
    drivers: drivers.get(row.id) ?? [],
  }));
}

export interface ScorecardView extends DriverScorecard {
  /** Leader and escalation-owner names by profile id. */
  names: Record<string, string>;
}

/**
 * The weekly driver scorecard: every delivery order in the week that went
 * ahead (cancelled orders are left out), and its reminder history.
 */
export async function loadDriverScorecard(
  supabase: Client,
  range: { start: string; end: string },
): Promise<ScorecardView> {
  const { data: orders, error } = await supabase
    .from("catering_orders")
    .select("id, guest_name, event_date, event_time, created_at")
    .eq("fulfillment", "delivery")
    .neq("stage", "cancelled")
    .gte("event_date", range.start)
    .lte("event_date", range.end);
  if (error) throw new Error(`Could not load the scorecard: ${error.message}`);
  const rows = orders ?? [];

  let log: ReminderLogRow[] = [];
  if (rows.length > 0) {
    const { data: reminders, error: reminderError } = await supabase
      .from("catering_driver_reminders")
      .select("order_id, kind, sent_at, folded, recipient_ids")
      .in(
        "order_id",
        rows.map((row) => row.id),
      );
    if (reminderError) throw new Error(`Could not load the scorecard: ${reminderError.message}`);
    log = (reminders ?? []).flatMap((row) =>
      (REMINDER_KINDS as readonly string[]).includes(row.kind)
        ? [
            {
              orderId: row.order_id,
              kind: row.kind as ReminderKind,
              sentAt: row.sent_at,
              folded: row.folded,
              recipientIds: row.recipient_ids,
            },
          ]
        : [],
    );
  }

  const card = buildDriverScorecard({
    orders: rows.map((row) => ({
      id: row.id,
      guestName: row.guest_name,
      eventDate: row.event_date,
      eventTime: row.event_time,
      createdAt: row.created_at,
    })),
    log,
  });
  const names = await profileNames(
    supabase,
    card.escalations.flatMap((escalation) => escalation.ownerIds),
  );
  return { ...card, names: Object.fromEntries(names) };
}
