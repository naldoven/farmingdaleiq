/**
 * Pure business logic for Catering (ARCHITECTURE.md "Catering (modeled on
 * the Avondale Catering Hub)"). Kept free of Supabase/Next imports so it is
 * unit-testable without a DB and safely importable from both server actions
 * and pages.
 *
 * Schema note: `catering_menu_items.components` and `.scaling_rules` are
 * untyped `jsonb` (supabase/migrations/20260707001500_catering.sql) with no
 * shape specced in ARCHITECTURE.md beyond prose ("Menu items know their
 * component breakdown... scaling_rules drive utensil/sauce quantities per
 * headcount"). This module defines and documents that shape itself:
 *   - components: Array<string | { name: string; qty?: number }> — what one
 *     unit of the menu item expands to for kitchen prep (qty defaults to 1).
 *   - scaling_rules: Array<{ label: string; perHeadcount?: number; perQty?:
 *     number }> — FOH setup supplies generated per guest and/or per line-item
 *     unit ordered.
 * `catering_checklist_items` has no quantity column, so scaled quantities are
 * baked into the generated item's label text (e.g. "Sauce packets — 40") at
 * materialization time; the row remains a normal add/removable checklist item
 * per ARCHITECTURE.md ("items can be added or removed per order").
 */

export const ORDER_STAGES = [
  "new",
  "confirm",
  "setup",
  "out",
  "followup",
  "closed",
] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  new: "New",
  confirm: "Confirmation Call",
  setup: "FOH Setup",
  out: "Pickup/Delivery",
  followup: "Follow-up",
  closed: "Closed",
};

export const CHECKLIST_STAGES = ["confirm", "setup", "kitchen_prep", "out"] as const;
export type ChecklistStage = (typeof CHECKLIST_STAGES)[number];

export const CHECKLIST_STAGE_LABELS: Record<ChecklistStage, string> = {
  confirm: "Confirmation Call",
  setup: "FOH Setup",
  kitchen_prep: "Kitchen Prep",
  out: "Pickup/Delivery Handoff",
};

export const FULFILLMENT_METHODS = ["pickup", "delivery"] as const;
export type FulfillmentMethod = (typeof FULFILLMENT_METHODS)[number];

export const HISTORY_PERIODS = ["month", "quarter", "year", "all"] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

export interface ComponentSpec {
  name: string;
  qty: number;
}

export interface ScalingRuleSpec {
  label: string;
  perHeadcount: number;
  perQty: number;
}

export interface ScaledLineItem {
  label: string;
  qty: number;
}

/** Parses `catering_menu_items.components` per the shape documented above. */
export function parseComponents(value: unknown): ComponentSpec[] {
  if (!Array.isArray(value)) return [];
  const out: ComponentSpec[] = [];
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim().length > 0) {
      out.push({ name: entry.trim(), qty: 1 });
    } else if (entry && typeof entry === "object") {
      const name = (entry as Record<string, unknown>).name;
      const qty = (entry as Record<string, unknown>).qty;
      if (typeof name === "string" && name.trim().length > 0) {
        out.push({
          name: name.trim(),
          qty: typeof qty === "number" && qty > 0 ? qty : 1,
        });
      }
    }
  }
  return out;
}

/** Parses `catering_menu_items.scaling_rules` per the shape documented above. */
export function parseScalingRules(value: unknown): ScalingRuleSpec[] {
  if (!Array.isArray(value)) return [];
  const out: ScalingRuleSpec[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const label = (entry as Record<string, unknown>).label;
    if (typeof label !== "string" || label.trim().length === 0) continue;
    const perHeadcount = (entry as Record<string, unknown>).perHeadcount;
    const perQty = (entry as Record<string, unknown>).perQty;
    out.push({
      label: label.trim(),
      perHeadcount: typeof perHeadcount === "number" ? perHeadcount : 0,
      perQty: typeof perQty === "number" ? perQty : 0,
    });
  }
  return out;
}

export interface OrderItemLike {
  menuItemId: string;
  qty: number;
}

export interface MenuItemLookup {
  components: unknown;
  scaling_rules: unknown;
}

function aggregate(entries: ScaledLineItem[]): ScaledLineItem[] {
  const totals = new Map<string, number>();
  const displayLabel = new Map<string, string>();
  for (const { label, qty } of entries) {
    const key = label.toLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + qty);
    if (!displayLabel.has(key)) displayLabel.set(key, label);
  }
  return Array.from(totals.entries())
    .map(([key, qty]) => ({ label: displayLabel.get(key)!, qty }))
    .filter((item) => item.qty > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Aggregates FOH setup supply quantities across every line item on an order,
 * scaled by headcount and/or line-item quantity (ARCHITECTURE.md: "FOH setup
 * quantities auto-scale from order items and headcount").
 */
export function computeScaledSetupItems(
  orderItems: OrderItemLike[],
  menuItemsById: Record<string, MenuItemLookup>,
  headcount: number,
): ScaledLineItem[] {
  const guests = Number.isFinite(headcount) && headcount > 0 ? headcount : 0;
  const entries: ScaledLineItem[] = [];
  for (const item of orderItems) {
    const menuItem = menuItemsById[item.menuItemId];
    if (!menuItem) continue;
    const rules = parseScalingRules(menuItem.scaling_rules);
    for (const rule of rules) {
      const qty = Math.ceil(rule.perHeadcount * guests + rule.perQty * item.qty);
      if (qty > 0) entries.push({ label: rule.label, qty });
    }
  }
  return aggregate(entries);
}

/**
 * Expands packaged menu items into their food-prep components, scaled by
 * how many of that line item were ordered (ARCHITECTURE.md: "a packaged meal
 * expands to sandwich, chips, cookie").
 */
export function computeKitchenPrepItems(
  orderItems: OrderItemLike[],
  menuItemsById: Record<string, MenuItemLookup>,
): ScaledLineItem[] {
  const entries: ScaledLineItem[] = [];
  for (const item of orderItems) {
    const menuItem = menuItemsById[item.menuItemId];
    if (!menuItem) continue;
    const components = parseComponents(menuItem.components);
    for (const component of components) {
      entries.push({ label: component.name, qty: component.qty * item.qty });
    }
  }
  return aggregate(entries);
}

/** Renders a scaled quantity into the label text a checklist item stores. */
export function formatScaledLabel(item: ScaledLineItem): string {
  return `${item.label} — ${item.qty}`;
}

export interface ChecklistDefaultLike {
  stage: string;
  label: string;
  sort: number;
}

export interface PlannedChecklistItem {
  stage: ChecklistStage;
  label: string;
  sort: number;
}

/**
 * Builds the full set of checklist items to materialize for a new order:
 * the active per-stage defaults, plus (for setup/kitchen_prep) the
 * auto-scaled supply and prep quantities computed from the order's line
 * items and headcount.
 */
export function planChecklistMaterialization(params: {
  defaults: ChecklistDefaultLike[];
  orderItems: OrderItemLike[];
  menuItemsById: Record<string, MenuItemLookup>;
  headcount: number;
}): PlannedChecklistItem[] {
  const { defaults, orderItems, menuItemsById, headcount } = params;
  const planned: PlannedChecklistItem[] = [];

  for (const stage of CHECKLIST_STAGES) {
    const stageDefaults = defaults
      .filter((d) => d.stage === stage)
      .sort((a, b) => a.sort - b.sort);
    let sort = 0;
    for (const d of stageDefaults) {
      planned.push({ stage, label: d.label, sort: sort++ });
    }

    if (stage === "setup") {
      for (const scaled of computeScaledSetupItems(orderItems, menuItemsById, headcount)) {
        planned.push({ stage, label: formatScaledLabel(scaled), sort: sort++ });
      }
    }
    if (stage === "kitchen_prep") {
      for (const scaled of computeKitchenPrepItems(orderItems, menuItemsById)) {
        planned.push({ stage, label: formatScaledLabel(scaled), sort: sort++ });
      }
    }
  }

  return planned;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves an inclusive [from, to] ISO-date range for the History page's
 * period filter. `to` is always "now"; `from` is null for "all" (no lower
 * bound).
 */
export function periodRange(
  period: HistoryPeriod,
  now: Date = new Date(),
): { from: string | null; to: string } {
  const to = toIsoDate(now);
  if (period === "all") return { from: null, to };

  if (period === "month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: toIsoDate(from), to };
  }

  if (period === "quarter") {
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    const from = new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1));
    return { from: toIsoDate(from), to };
  }

  // year
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return { from: toIsoDate(from), to };
}

export interface OrderRollupInput {
  id: string;
  contact_id: string | null;
  amount: number | null;
  event_date: string;
}

export interface ContactRollup {
  orderCount: number;
  lifetimeSpend: number;
  lastEventDate: string | null;
}

/**
 * Computes per-contact order count, lifetime spend, and last event date from
 * a flat list of orders (ARCHITECTURE.md: "every guest becomes a contact
 * carrying order count, lifetime spend, and last event date" — always
 * computed, never stored).
 */
export function computeContactRollups(
  orders: OrderRollupInput[],
): Map<string, ContactRollup> {
  const rollups = new Map<string, ContactRollup>();
  for (const order of orders) {
    if (!order.contact_id) continue;
    const existing = rollups.get(order.contact_id) ?? {
      orderCount: 0,
      lifetimeSpend: 0,
      lastEventDate: null,
    };
    existing.orderCount += 1;
    existing.lifetimeSpend += order.amount ?? 0;
    if (!existing.lastEventDate || order.event_date > existing.lastEventDate) {
      existing.lastEventDate = order.event_date;
    }
    rollups.set(order.contact_id, existing);
  }
  return rollups;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Returns the Monday-anchored ISO-week key ("2026-W01") for an ISO date string. */
export function isoWeekKey(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const target = new Date(date.getTime());
  const dayNumber = (date.getUTCDay() + 6) % 7; // Monday = 0
  target.setUTCDate(target.getUTCDate() - dayNumber + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface AnalyticsOrderInput {
  id: string;
  contact_id: string | null;
  amount: number | null;
  event_date: string;
}

export interface AnalyticsContactInput {
  id: string;
  name: string;
}

export interface CateringAnalytics {
  totalOrders: number;
  totalRevenue: number;
  averageOrder: number;
  repeatGuestPercentage: number;
  revenueByWeek: Array<{ week: string; revenue: number }>;
  busiestDays: Array<{ day: string; count: number }>;
  topGuests: Array<{ contactId: string; name: string; lifetimeSpend: number; orderCount: number }>;
}

/**
 * Computes the /catering/analytics figures (ARCHITECTURE.md: "total orders,
 * total revenue, average order, repeat-guest percentage, revenue by week,
 * busiest days, top guests").
 */
export function computeAnalytics(
  orders: AnalyticsOrderInput[],
  contacts: AnalyticsContactInput[],
): CateringAnalytics {
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const averageOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const rollups = computeContactRollups(orders);
  const contactsWithOrders = rollups.size;
  const repeatContacts = Array.from(rollups.values()).filter((r) => r.orderCount > 1).length;
  const repeatGuestPercentage =
    contactsWithOrders > 0 ? (repeatContacts / contactsWithOrders) * 100 : 0;

  const weekTotals = new Map<string, number>();
  const dayTotals = new Map<string, number>();
  for (const order of orders) {
    const week = isoWeekKey(order.event_date);
    weekTotals.set(week, (weekTotals.get(week) ?? 0) + (order.amount ?? 0));

    const day = WEEKDAY_NAMES[new Date(`${order.event_date}T00:00:00Z`).getUTCDay()];
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + 1);
  }

  const revenueByWeek = Array.from(weekTotals.entries())
    .map(([week, revenue]) => ({ week, revenue }))
    .sort((a, b) => a.week.localeCompare(b.week));

  const busiestDays = Array.from(dayTotals.entries())
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => b.count - a.count);

  const nameById = new Map(contacts.map((c) => [c.id, c.name]));
  const topGuests = Array.from(rollups.entries())
    .map(([contactId, rollup]) => ({
      contactId,
      name: nameById.get(contactId) ?? "Unknown guest",
      lifetimeSpend: rollup.lifetimeSpend,
      orderCount: rollup.orderCount,
    }))
    .sort((a, b) => b.lifetimeSpend - a.lifetimeSpend)
    .slice(0, 5);

  return {
    totalOrders,
    totalRevenue,
    averageOrder,
    repeatGuestPercentage,
    revenueByWeek,
    busiestDays,
    topGuests,
  };
}

/**
 * Returns the 7 ISO dates (Sunday through Saturday) of the week containing
 * `now`, for the /catering/week "This Week" calendar.
 */
export function currentWeekDates(now: Date = new Date()): string[] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime());
    d.setUTCDate(d.getUTCDate() + i);
    return toIsoDate(d);
  });
}

/**
 * Default follow-up due date when an order closes: 30 days out, a re-book
 * prompt cadence (ARCHITECTURE.md: "Closing an order queues a follow-up call
 * to re-book"; the exact cadence isn't specced, so this is a sensible
 * default // SEED-DEFAULT).
 */
export function defaultFollowUpDueDate(eventDate: string): string {
  const date = new Date(`${eventDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 30);
  return toIsoDate(date);
}
