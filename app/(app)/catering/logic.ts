import { neutralizeDiscordMentions } from "@/lib/discord/mentions";
import {
  addStoreCalendarDays,
  formatStoreTime,
  storeDateTimeInputToIso,
  storeLocalDate as getStoreLocalDate,
} from "@/lib/time";

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

/**
 * The kanban pipeline flow stages (New -> ... -> Closed). These drive the
 * board columns and the stage dropdown, so `cancelled` is deliberately NOT
 * here — a cancellation is a terminal side-exit reached via the cancelOrder
 * action, not a normal forward move you drag a card into.
 */
export const ORDER_STAGES = [
  "new",
  "confirm",
  "setup",
  "out",
  "followup",
  "closed",
] as const;

/**
 * CAT1: terminal "cancelled" stage for an erroneous/duplicate/walked-away
 * order. It must never count as revenue and must not queue a re-book
 * follow-up. Kept off ORDER_STAGES so it doesn't become a kanban column /
 * dropdown target, but part of the persisted stage domain below.
 */
export const CANCELLED_STAGE = "cancelled" as const;

/** Every value the catering_orders.stage column can hold, flow + cancelled. */
export const ALL_ORDER_STAGES = [...ORDER_STAGES, CANCELLED_STAGE] as const;
export type OrderStage = (typeof ALL_ORDER_STAGES)[number];

export const ORDER_STAGE_LABELS: Record<OrderStage, string> = {
  new: "New",
  confirm: "Confirmation Call",
  setup: "FOH Setup",
  out: "Pickup/Delivery",
  followup: "Follow-up",
  closed: "Closed",
  cancelled: "Cancelled",
};

export type FlowStage = (typeof ORDER_STAGES)[number];

/** The one stage a leader may move an order to next, or null at the end of the flow. */
export function nextCateringStage(stage: string): FlowStage | null {
  const index = ORDER_STAGES.indexOf(stage as FlowStage);
  if (index === -1) return null;
  return ORDER_STAGES[index + 1] ?? null;
}

/**
 * The stage a manager's "Move back one step" lands on. `new` has nothing
 * before it, and a cancelled order goes through Restore instead, so both
 * return null.
 */
export function previousCateringStage(stage: string): FlowStage | null {
  const index = ORDER_STAGES.indexOf(stage as FlowStage);
  if (index <= 0) return null;
  return ORDER_STAGES[index - 1];
}

/**
 * The staff pipeline is deliberately forward-only. Letting a card jump from
 * New straight to dispatch makes the board look complete while the
 * confirmation and packing work was never done. Cancellations keep their
 * dedicated action, available from every active stage; moving back and
 * restoring are manager overrides (catering.override) with their own actions.
 */
export function cateringStageAdvanceError(fromStage: string, toStage: OrderStage): string | null {
  if (fromStage === "closed") return "This order is closed and cannot move forward.";

  const next = nextCateringStage(fromStage);
  if (!next) return "Cancelled orders cannot return to the active pipeline.";
  if (toStage !== next) return `Move this order to ${ORDER_STAGE_LABELS[next]} next.`;

  return null;
}

/**
 * Stages a manager can restore a cancelled order to. Closed is left out on
 * purpose: closing is what queues the re-book follow-up call, so a restored
 * order goes back to Follow-up at the latest and is closed through the normal
 * move, which keeps that one follow-up rule in a single place.
 */
export const RESTORE_STAGES = ["new", "confirm", "setup", "out", "followup"] as const;
export type RestoreStage = (typeof RESTORE_STAGES)[number];

/**
 * The every-minute cron moves Pickup/Delivery orders to Follow-up once their
 * event time passes (isCateringFollowUpDue). A manager override that lands an
 * order on Pickup/Delivery after that time would be undone a minute later, so
 * it is refused with a reason instead of looking like it silently failed.
 */
export function stageOverrideTargetError(
  order: { event_date: string; event_time: string | null },
  toStage: OrderStage,
  now: Date = new Date(),
): string | null {
  if (toStage === "out" && isCateringFollowUpDue({ ...order, stage: "out" }, now)) {
    return "The event time has passed, so this order would go straight back to Follow-up.";
  }
  return null;
}

/**
 * Stages a stale order can still sit in. Closed is done and cancelled has its
 * own manager path (Restore), so neither is offered on the bulk close screen.
 * Derived from ORDER_STAGES so a stage added to the flow is covered.
 */
export const STALE_CLOSABLE_STAGES = ORDER_STAGES.filter(
  (stage): stage is Exclude<FlowStage, "closed"> => stage !== "closed",
);

/**
 * Whether an order is a past-event order still open on the pipeline: the
 * event date is before today's store date and the stage is one a manager may
 * bulk close. Same rule the catering_bulk_close function and the stage guard
 * apply in the database (supabase/migrations/20261026000000_catering_bulk_close.sql).
 */
export function isStaleOpenOrder(
  order: { stage: string; event_date: string },
  today: string = getStoreLocalDate(new Date()),
): boolean {
  return (
    (STALE_CLOSABLE_STAGES as readonly string[]).includes(order.stage) && order.event_date < today
  );
}

/** Per-order results catering_bulk_close returns, mirrored here for the summary text. */
export const BULK_CLOSE_OUTCOMES = ["closed", "already_closed", "cancelled", "not_past", "not_found"] as const;
export type BulkCloseOutcome = (typeof BULK_CLOSE_OUTCOMES)[number];

export interface BulkCloseSummary {
  closed: number;
  alreadyClosed: number;
  cancelled: number;
  notPast: number;
  notFound: number;
}

/** Counts the outcomes of one bulk close. Unknown outcomes count as not found. */
export function summarizeBulkClose(rows: readonly { outcome: string }[]): BulkCloseSummary {
  const summary: BulkCloseSummary = { closed: 0, alreadyClosed: 0, cancelled: 0, notPast: 0, notFound: 0 };
  for (const row of rows) {
    if (row.outcome === "closed") summary.closed += 1;
    else if (row.outcome === "already_closed") summary.alreadyClosed += 1;
    else if (row.outcome === "cancelled") summary.cancelled += 1;
    else if (row.outcome === "not_past") summary.notPast += 1;
    else summary.notFound += 1;
  }
  return summary;
}

function countOrders(count: number): string {
  return `${count} ${count === 1 ? "order" : "orders"}`;
}

/**
 * One plain sentence per outcome the manager needs to know about. A rerun of
 * the same batch reports "already closed" instead of looking like it failed.
 */
export function describeBulkCloseSummary(summary: BulkCloseSummary): string {
  const parts: string[] = [`Closed ${countOrders(summary.closed)}.`];
  if (summary.alreadyClosed > 0) parts.push(`${countOrders(summary.alreadyClosed)} ${summary.alreadyClosed === 1 ? "was" : "were"} already closed.`);
  if (summary.cancelled > 0) parts.push(`${countOrders(summary.cancelled)} ${summary.cancelled === 1 ? "is" : "are"} cancelled and stayed that way.`);
  if (summary.notPast > 0) parts.push(`${countOrders(summary.notPast)} ${summary.notPast === 1 ? "is" : "are"} not past yet and stayed open.`);
  if (summary.notFound > 0) parts.push(`${countOrders(summary.notFound)} could not be found.`);
  return parts.join(" ");
}

/**
 * Stages excluded from every money/analytics rollup: `new` (unconfirmed, not
 * real spend yet) and `cancelled` (CAT1 — a cancelled order must never count
 * toward revenue, lifetime spend, or analytics). One shared source of truth so
 * /catering/analytics, /catering/history, and the order-detail guest-history
 * box (CAT4) agree instead of drifting apart.
 */
export const NON_REVENUE_STAGES: readonly OrderStage[] = ["new", CANCELLED_STAGE];

/** Whether an order's stage counts toward revenue/analytics rollups. */
export function countsAsRevenue(stage: string): boolean {
  return !(NON_REVENUE_STAGES as readonly string[]).includes(stage);
}

/** Filters a list of orders down to those that count as revenue. */
export function filterRevenueOrders<T extends { stage: string }>(orders: T[]): T[] {
  return orders.filter((order) => countsAsRevenue(order.stage));
}

export const CHECKLIST_STAGES = ["confirm", "setup", "kitchen_prep", "out"] as const;
export type ChecklistStage = (typeof CHECKLIST_STAGES)[number];

export const CHECKLIST_STAGE_LABELS: Record<ChecklistStage, string> = {
  confirm: "Confirmation Call",
  setup: "FOH Setup",
  kitchen_prep: "Kitchen Prep",
  out: "Pre-order checklist",
};

/** The checklist that must be complete before each operational handoff. */
export function checklistRequiredBeforeStageAdvance(fromStage: string): ChecklistStage | null {
  if (fromStage === "confirm") return "confirm";
  if (fromStage === "setup") return "setup";
  if (fromStage === "out") return "out";
  return null;
}

/**
 * Leaving FOH Setup also needs the packing list itself. Until the day before
 * the event an order has zero setup rows, so the "no undone item" check alone
 * passed and an order could leave FOH Setup before its list was ever built.
 */
export const PACKING_LIST_NOT_BUILT_ERROR =
  "No packing list yet. It is built the day before the event, or you can build it on the order page on the event day.";

/**
 * A build stamps setup_generated_at when it claims the order, a moment before
 * its rows are inserted, so a fresh stamp can sit beside an empty list. A row
 * count cannot tell "still building" from "built, nothing to pack": an order
 * with no paper goods, drinks, sauces or trays legitimately builds zero setup
 * rows, and the Pre-order items live on the Pickup/Delivery checklist. So the
 * gate waits until the stamp is older than any build takes. A small list can
 * be packed inside that window (for example a 4-item rebuild after an
 * event-day edit), so the refusal names the exact time the move opens rather
 * than a vague "try again". Every rebuild restarts the wait.
 */
export const SETUP_BUILD_SETTLE_MS = 2 * 60 * 1000;

/** Fallback when the stamp cannot be read, so no time can be named. */
export const PACKING_LIST_BUILDING_ERROR =
  "The packing list was just rebuilt. Wait two minutes, then move this order on.";

/** Why an order cannot leave FOH Setup yet because of its packing list, or null. */
export function packingListGateError(
  setupGeneratedAt: string | null,
  now: Date = new Date(),
): string | null {
  if (!setupGeneratedAt) return PACKING_LIST_NOT_BUILT_ERROR;
  const stamped = new Date(setupGeneratedAt).getTime();
  if (Number.isNaN(stamped)) return PACKING_LIST_BUILDING_ERROR;
  const readyAt = stamped + SETUP_BUILD_SETTLE_MS;
  if (now.getTime() < readyAt) {
    return `The packing list was rebuilt at ${formatStoreTime(new Date(stamped))}. You can move this order on at ${formatStoreTime(new Date(readyAt))}.`;
  }
  return null;
}

export const PRE_ORDER_CHECKLIST_ITEMS = [
  "Compare packed items to the receipt",
  "Verify sauces and special instructions",
  "Cold items packed last",
] as const;

/** The fixed handoff checklist created for every catering order. */
export function planPreOrderChecklist(): PlannedChecklistItem[] {
  return PRE_ORDER_CHECKLIST_ITEMS.map((label, index) => ({
    stage: "out",
    label,
    sort: 900 + index,
  }));
}

/**
 * The Pre-order items an order is still missing. Editing an order wipes and
 * rebuilds only the packing list (rows with a setup_section), so the
 * Pre-order rows survive the edit; adding all three again on every rebuild
 * is what duplicated them.
 */
export function planMissingPreOrderChecklist(existingLabels: readonly string[]): PlannedChecklistItem[] {
  const existing = new Set(existingLabels.map((label) => label.trim().toLowerCase()));
  return planPreOrderChecklist().filter((item) => !existing.has(item.label.toLowerCase()));
}

export const FULFILLMENT_METHODS = ["pickup", "delivery"] as const;
export type FulfillmentMethod = (typeof FULFILLMENT_METHODS)[number];

/**
 * Whether an active pickup/delivery handoff is ready for Follow-up. Event
 * dates and times are stored separately as Farmingdale wall-clock values, so
 * convert them with the central America/New_York helper before comparing
 * instants. Orders without a time stay in Pickup/Delivery for a leader to
 * resolve manually rather than moving on an inferred schedule.
 */
export function isCateringFollowUpDue(
  order: { stage: string; event_date: string; event_time: string | null },
  now: Date = new Date(),
): boolean {
  if (order.stage !== "out" || !order.event_time) return false;

  const time = order.event_time.slice(0, 8);
  const scheduledAt = storeDateTimeInputToIso(`${order.event_date}T${time}`);
  if (!scheduledAt) return false;

  return new Date(scheduledAt).getTime() <= now.getTime();
}

/** Whether today is the Farmingdale calendar day before the event. */
export function isCateringSetupDay(eventDate: string, now: Date = new Date()): boolean {
  return eventDate === addStoreCalendarDays(getStoreLocalDate(now), 1);
}

/**
 * The store days the cron builds a missing packing list: the day before the
 * event, and the event day itself. The event day covers same-day orders
 * (created after the day-before run) and a list wiped by an edit that morning.
 */
export function isCateringSetupWindow(eventDate: string, now: Date = new Date()): boolean {
  const today = getStoreLocalDate(now);
  return eventDate === today || eventDate === addStoreCalendarDays(today, 1);
}

/**
 * Whether a leader may build the packing list by hand. The day-before rule
 * exists so the list is not built from a receipt that can still change, so
 * only "too early" is refused. Past events are allowed: an order stuck in FOH
 * Setup without a list could otherwise never leave it.
 */
export function canBuildCateringSetup(eventDate: string, now: Date = new Date()): boolean {
  return eventDate <= addStoreCalendarDays(getStoreLocalDate(now), 1);
}

/**
 * Stages whose packing list may be built or rebuilt, by hand or by the cron
 * (the cron also stops at FOH Setup). Listed, not "everything but X", so a
 * stage added later is refused until someone decides it belongs here.
 */
export const SETUP_BUILD_STAGES = ["new", "confirm", "setup", "out"] as const;
const CRON_SETUP_STAGES = ["new", "confirm", "setup"] as const;

export function isSetupBuildStage(stage: string): boolean {
  return (SETUP_BUILD_STAGES as readonly string[]).includes(stage);
}

/** Generates a packing setup at most once, on the day before or the event day. */
export function isCateringSetupDue(
  order: { stage: string; event_date: string; setup_generated_at: string | null },
  now: Date = new Date(),
): boolean {
  return (
    (CRON_SETUP_STAGES as readonly string[]).includes(order.stage) &&
    !order.setup_generated_at &&
    isCateringSetupWindow(order.event_date, now)
  );
}

/**
 * The order row is inserted before its items and checklists (createOrder and
 * the inbound email route), so for a moment it looks like an order with no
 * call items and no menu. The cron leaves an order alone until it is this
 * old, so it never builds an empty list or reads a missing call as done.
 */
export const NEW_ORDER_SETTLE_MS = 2 * 60 * 1000;

export function isNewOrderSettling(createdAt: string, now: Date = new Date()): boolean {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now.getTime() - created < NEW_ORDER_SETTLE_MS;
}

/**
 * The call counts as done only when the order has Confirmation Call items
 * and every one is ticked. Zero items is "not done": it is what a half
 * created order looks like, and an order with no call list was never called
 * as far as the app knows.
 */
export function isConfirmationCallDone(callItems: readonly { done: boolean }[]): boolean {
  return callItems.length > 0 && callItems.every((item) => item.done);
}

/**
 * Whether a person moved the order's stage during its build window, which
 * starts at midnight (store time) on the day before the event. A manager's
 * move back or restore, or a leader's own move, means a person is steering
 * this order, so the cron must not move it to FOH Setup on top of them.
 */
export function isStageTouchedInSetupWindow(order: {
  event_date: string;
  stage_changed_at: string | null;
}): boolean {
  if (!order.stage_changed_at) return false;
  const windowStart = storeDateTimeInputToIso(`${addStoreCalendarDays(order.event_date, -1)}T00:00`);
  if (!windowStart) return false;
  return new Date(order.stage_changed_at).getTime() >= new Date(windowStart).getTime();
}

/**
 * The cron's one rule for moving an order to FOH Setup after building its
 * list: still in New or Confirmation Call, the call is done (positive gate,
 * see isConfirmationCallDone), and nobody has moved its stage since the
 * build window opened.
 */
export function canCronMoveToSetup(
  order: { stage: string; event_date: string; stage_changed_at: string | null },
  callItems: readonly { done: boolean }[],
): boolean {
  return (
    (order.stage === "new" || order.stage === "confirm") &&
    isConfirmationCallDone(callItems) &&
    !isStageTouchedInSetupWindow(order)
  );
}

/**
 * "Call not done" badge: the order is still in New or Confirmation Call, its
 * event is tomorrow, today, or already past, and the call is not done (an
 * undone call item, or no call items at all). Past events stay flagged
 * because the call is still missing. Shown without a schema change.
 */
export function isConfirmationCallLate(
  order: { stage: string; event_date: string },
  callItems: readonly { done: boolean }[],
  now: Date = new Date(),
): boolean {
  return (
    (order.stage === "new" || order.stage === "confirm") &&
    order.event_date <= addStoreCalendarDays(getStoreLocalDate(now), 1) &&
    !isConfirmationCallDone(callItems)
  );
}

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

/**
 * A physical setup is the one packing list staff work from on the calendar
 * day before an order. It intentionally uses the existing checklist rows for
 * completion history, while sections make the list scannable on a phone.
 */
export const PHYSICAL_SETUP_SECTIONS = [
  "paper_goods",
  "sauces_dressings",
  "beverages",
] as const;
export type PhysicalSetupSection = (typeof PHYSICAL_SETUP_SECTIONS)[number];

export const PHYSICAL_SETUP_SECTION_LABELS: Record<PhysicalSetupSection, string> = {
  paper_goods: "Paper goods",
  sauces_dressings: "Sauces & dressings",
  beverages: "Beverages",
};

export interface PhysicalSetupLineItem {
  name: string;
  qty: number;
}

export interface PhysicalSetupItem {
  section: PhysicalSetupSection;
  label: string;
  qty: number;
}

function normalizedSetupName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function setupSize(name: string): "small" | "medium" | "large" | null {
  const normalized = normalizedSetupName(name);
  if (normalized.includes("small")) return "small";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("large")) return "large";
  return null;
}

function setupQty(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function sizedQty(
  size: "small" | "medium" | "large" | null,
  quantities: { small: number; medium: number; large: number },
): number {
  if (size === "small") return quantities.small;
  if (size === "medium") return quantities.medium;
  if (size === "large") return quantities.large;
  return 0;
}

function isBeverage(name: string): boolean {
  const normalized = normalizedSetupName(name);
  return (
    normalized.includes("gallon") ||
    normalized.includes("96 oz coffee") ||
    normalized.includes("bottled water") ||
    normalized.includes("bottled lemonade") ||
    normalized.includes("juice") ||
    normalized.includes("milk") ||
    normalized.includes("bag of ice")
  );
}

/**
 * Receipt lines are not restricted to the catering menu catalog. Keep known
 * sauce, dressing, and tray-condiment names together without moving food
 * items that happen to contain a similar word into the wrong setup section.
 */
/**
 * CFA receipts render selected sauces and dressings as their own child line
 * below the catering item. The receipt is the authority: a tray's normal
 * condiment guide never creates a made-up selection for the packing list.
 */
export function isRequestedCondiment(name: string): boolean {
  const normalized = normalizedSetupName(name);
  if (normalized === "no sauce" || normalized === "no dressing") return false;
  if (normalized.includes("chip")) return false;

  return [
    "sauce",
    "dressing",
    "honey roasted bbq",
    "polynesian",
    "sriracha",
    "buffalo",
    "barbecue",
    "ketchup",
    "mustard",
    "mayo",
    "hot sauce",
    "honey packet",
    "grape jelly",
    "strawberry jelly",
    "jalapeno ranch",
    "avocado lime ranch",
    "creamy salsa",
    "garden herb ranch",
    "light balsamic",
    "lite italian",
    "zesty apple cider",
    "honey mustard",
    "roasted almonds",
  ].some((term) => normalized.includes(term));
}

/** Keeps only valid receipt-selected sauce and dressing lines from jsonb. */
export function parseRequestedCondiments(value: unknown): PhysicalSetupLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const name = (entry as Record<string, unknown>).name;
    const qty = (entry as Record<string, unknown>).qty;
    if (typeof name !== "string" || !isRequestedCondiment(name)) return [];
    return [{ name: name.trim(), qty: setupQty(typeof qty === "number" ? qty : 0) }];
  });
}

function addSetupItem(
  entries: PhysicalSetupItem[],
  section: PhysicalSetupSection,
  label: string,
  qty: number,
) {
  const safeQty = setupQty(qty);
  if (safeQty > 0) entries.push({ section, label, qty: safeQty });
}

function addTrayPaperGoods(entries: PhysicalSetupItem[], item: PhysicalSetupLineItem) {
  const name = normalizedSetupName(item.name);
  const size = setupSize(item.name);
  const ordered = setupQty(item.qty);
  if (ordered === 0) return;

  if (name.includes("grilled chicken bundle")) {
    addSetupItem(entries, "paper_goods", "Tongs", 3 * ordered);
    return;
  }

  if (name.includes("chick n mini") && name.includes("tray")) {
    addSetupItem(entries, "paper_goods", "Tongs", ordered);
    return;
  }

  if (name.includes("mac") && name.includes("cheese") && name.includes("tray")) {
    addSetupItem(entries, "paper_goods", "Serving spoons", sizedQty(size, { small: 1, medium: 0, large: 2 }) * ordered);
    return;
  }

  if (name.includes("fruit tray")) {
    addSetupItem(entries, "paper_goods", "Serving spoons", sizedQty(size, { small: 1, medium: 0, large: 2 }) * ordered);
    return;
  }

  if (name.includes("kale crunch") && name.includes("tray")) {
    addSetupItem(entries, "paper_goods", "Tongs", ordered);
    return;
  }

  if (name.includes("garden salad") && name.includes("tray")) {
    addSetupItem(entries, "paper_goods", "Tongs", ordered);
    return;
  }

  if ((name.includes("cool wrap") || name.includes("southwest veggie wrap")) && name.includes("tray")) {
    const spicy = name.includes("spicy chilled grilled chicken");
    const veggie = name.includes("southwest veggie");
    addSetupItem(
      entries,
      "paper_goods",
      "Tongs",
      sizedQty(size, spicy ? { small: 1, medium: 2, large: 3 } : veggie ? { small: 1, medium: 1, large: 2 } : { small: 1, medium: 1, large: 2 }) * ordered,
    );
    return;
  }

  if (name.includes("chilled") && name.includes("chicken sub") && name.includes("tray")) {
    addSetupItem(entries, "paper_goods", "Tongs", sizedQty(size, { small: 1, medium: 2, large: 2 }) * ordered);
    return;
  }

  if (name.includes("nugget") && name.includes("tray")) {
    addSetupItem(entries, "paper_goods", "Serving spoons", sizedQty(size, { small: 1, medium: 1, large: 2 }) * ordered);
    return;
  }

  if (name.includes("chick n strips") && name.includes("tray")) {
    addSetupItem(entries, "paper_goods", "Tongs", sizedQty(size, { small: 1, medium: 1, large: 2 }) * ordered);
    return;
  }

  if (
    name.includes("chocolate chunk cookie tray") ||
    name.includes("chocolate fudge brownie tray") ||
    name.includes("cookie and chocolate fudge brownie tray")
  ) {
    addSetupItem(entries, "paper_goods", "Tongs", ordered);
  }
}

function addPaperGoodsForTray(entries: PhysicalSetupItem[], item: PhysicalSetupLineItem) {
  const name = normalizedSetupName(item.name);
  const size = setupSize(item.name);
  const ordered = setupQty(item.qty);
  if (ordered === 0) return;

  if (name.includes("fruit tray")) {
    const count = sizedQty(size, { small: 12, medium: 0, large: 26 }) * ordered;
    addSetupItem(entries, "paper_goods", "Plates", count);
    addSetupItem(entries, "paper_goods", "Cutlery sets", count);
  }

  if (
    name.includes("chocolate chunk cookie tray") ||
    name.includes("chocolate fudge brownie tray") ||
    name.includes("cookie and chocolate fudge brownie tray")
  ) {
    addSetupItem(
      entries,
      "paper_goods",
      "Dessert plates",
      sizedQty(size, { small: 12, medium: 0, large: 24 }) * ordered,
    );
  }
}

function aggregatePhysicalSetupItems(entries: PhysicalSetupItem[]): PhysicalSetupItem[] {
  const totals = new Map<string, PhysicalSetupItem>();
  for (const entry of entries) {
    const key = `${entry.section}:${entry.label.toLowerCase()}`;
    const existing = totals.get(key);
    if (existing) {
      existing.qty += entry.qty;
    } else {
      totals.set(key, { ...entry });
    }
  }
  const sectionOrder = new Map(PHYSICAL_SETUP_SECTIONS.map((section, index) => [section, index]));
  return Array.from(totals.values()).sort(
    (a, b) =>
      (sectionOrder.get(a.section)! - sectionOrder.get(b.section)!) ||
      a.label.localeCompare(b.label),
  );
}

/**
 * Builds the packing list from the receipt/menu items and Farmingdale's tray
 * guide. Paper goods are strictly opt-in: when the receipt says no, no cups,
 * plates, or cutlery sets are generated.
 */
export function buildPhysicalOrderSetup(input: {
  items: PhysicalSetupLineItem[];
  selectedCondiments?: PhysicalSetupLineItem[];
  headcount: number;
  paperGoods: boolean;
  fulfillment: string | null;
}): PhysicalSetupItem[] {
  const entries: PhysicalSetupItem[] = [];
  const items = input.items.filter((item) => item.name.trim() && setupQty(item.qty) > 0);
  const selectedCondiments = (input.selectedCondiments ?? items.filter((item) => isRequestedCondiment(item.name)))
    .filter((item) => item.name.trim() && setupQty(item.qty) > 0 && isRequestedCondiment(item.name));

  for (const item of items) {
    if (isBeverage(item.name)) addSetupItem(entries, "beverages", item.name.trim(), item.qty);
    if (!isRequestedCondiment(item.name)) addTrayPaperGoods(entries, item);
  }

  for (const condiment of selectedCondiments) {
    addSetupItem(entries, "sauces_dressings", condiment.name.trim(), condiment.qty);
  }

  if (input.paperGoods) {
    const guests = setupQty(input.headcount);
    addSetupItem(entries, "paper_goods", "Plates", guests);
    addSetupItem(entries, "paper_goods", "Cups", guests);
    addSetupItem(entries, "paper_goods", "Cutlery sets", guests);
    for (const item of items) addPaperGoodsForTray(entries, item);

    // Each gallon drink (and the 96 oz coffee carrier) receives twelve cups.
    for (const item of items) {
      const name = normalizedSetupName(item.name);
      if (name.includes("gallon") || name.includes("96 oz coffee")) {
        addSetupItem(entries, "beverages", "Drink cups", 12 * setupQty(item.qty));
      }
    }
  }

  return aggregatePhysicalSetupItems(entries);
}

/** Extracts the original receipt items preserved by composeOrderNotes. */
export function parseOrderItemsFromNotes(notes: string | null | undefined): PhysicalSetupLineItem[] {
  if (!notes) return [];
  const itemBlock = notes.match(/(?:^|\n)Items:\n([\s\S]*?)(?:\n\n|$)/);
  if (!itemBlock) return [];
  const items: PhysicalSetupLineItem[] = [];
  for (const line of itemBlock[1].split("\n")) {
    const match = line.match(/^-\s+(\d+)x\s+(.+?)(?:\s+\(\$[\d,]+\.\d{2}\))?$/);
    if (match) items.push({ name: match[2].trim(), qty: Number(match[1]) });
  }
  return items;
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
 * the active per-stage defaults, plus kitchen-prep quantities computed from
 * the order's line items. The physical FOH setup is materialized only after
 * confirmation, not when an order first arrives.
 */
export function planChecklistMaterialization(params: {
  defaults: ChecklistDefaultLike[];
  orderItems: OrderItemLike[];
  menuItemsById: Record<string, MenuItemLookup>;
  headcount: number;
}): PlannedChecklistItem[] {
  const { defaults, orderItems, menuItemsById } = params;
  const planned: PlannedChecklistItem[] = [];

  for (const stage of CHECKLIST_STAGES) {
    // The physical setup is generated by the day-before cron, not when an
    // order first arrives or when its stage changes.
    if (stage === "setup") continue;
    const stageDefaults = defaults
      .filter((d) => d.stage === stage)
      .sort((a, b) => a.sort - b.sort);
    let sort = 0;
    for (const d of stageDefaults) {
      planned.push({ stage, label: d.label, sort: sort++ });
    }

    if (stage === "kitchen_prep") {
      for (const scaled of computeKitchenPrepItems(orderItems, menuItemsById)) {
        planned.push({ stage, label: formatScaledLabel(scaled), sort: sort++ });
      }
    }
  }

  return planned;
}

function localDateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month, day];
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
  const to = getStoreLocalDate(now);
  const [year, month] = localDateParts(to);
  if (period === "all") return { from: null, to };

  if (period === "month") {
    return { from: `${year}-${String(month).padStart(2, "0")}-01`, to };
  }

  if (period === "quarter") {
    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return { from: `${year}-${String(quarterStartMonth).padStart(2, "0")}-01`, to };
  }

  // year
  return { from: `${year}-01-01`, to };
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
  const today = getStoreLocalDate(now);
  const dayOfWeek = new Date(`${today}T12:00:00.000Z`).getUTCDay();
  const start = addStoreCalendarDays(today, -dayOfWeek);
  return Array.from({ length: 7 }, (_, i) => addStoreCalendarDays(start, i));
}

/**
 * Default follow-up due date when an order closes: 30 days out, a re-book
 * prompt cadence (ARCHITECTURE.md: "Closing an order queues a follow-up call
 * to re-book"; the exact cadence isn't specced, so this is a sensible
 * default // SEED-DEFAULT).
 */
export function defaultFollowUpDueDate(eventDate: string): string {
  return addStoreCalendarDays(eventDate, 30);
}

/**
 * Returns YYYY-MM-DD for `now` in the given IANA timezone (parity audit
 * Catering finding: "Today/period boundaries computed in UTC, not store
 * timezone"). Mirrors the FIQ-12 pattern already used by the checklists cron
 * (app/(app)/checklists/logic.ts storeLocalNow), kept as a small local copy
 * here rather than a cross-module import so Catering's day-boundary math
 * doesn't depend on another module's file. Used by the pipeline board's
 * "new orders today" strip.
 */
export function storeLocalDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Strips everything but digits so differently formatted phone numbers (e.g.
 * "(555) 123-4567" vs "555-123-4567") dedupe to the same contact (parity
 * audit Catering finding: "Contact dedup has no DB constraint and no phone
 * normalization"). A DB-level unique index on the normalized value is a
 * schema change out of this stream's file ownership; this normalizes both
 * the lookup and the stored value so new contacts dedupe correctly going
 * forward.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Discord message body for a new catering order (parity audit Catering
 * finding: "Discord posts carry no order details").
 */
export function formatOrderNewMessage(input: {
  guestName: string;
  eventDate: string;
  headcount: number | null;
}): string {
  const guests = input.headcount ? `, ${input.headcount} guests` : "";
  // Guest names can arrive from an inbound customer email; never let one ping.
  return `${neutralizeDiscordMentions(input.guestName)} — ${input.eventDate}${guests}`;
}

/**
 * Discord message body for a catering stage change (parity audit Catering
 * finding: "Discord posts carry no order details").
 */
export function formatStageChangeMessage(input: {
  guestName: string;
  eventDate: string;
  fromStage: OrderStage;
  toStage: OrderStage;
}): string {
  return `${neutralizeDiscordMentions(input.guestName)} — ${input.eventDate}: ${ORDER_STAGE_LABELS[input.fromStage]} → ${ORDER_STAGE_LABELS[input.toStage]}`;
}

export type StageOverrideKind = "move_back" | "restore";

/**
 * Discord body for a manager override. Carries the reason so the catering
 * channel shows why an order went backwards, not just that it did.
 */
export function formatStageOverrideMessage(input: {
  guestName: string;
  eventDate: string;
  fromStage: OrderStage;
  toStage: OrderStage;
  kind: StageOverrideKind;
  reason: string;
}): string {
  const action = input.kind === "move_back" ? "Moved back" : "Restored";
  // formatStageChangeMessage already neutralizes the guest name; the reason is
  // free text typed by a manager, so it gets the same treatment here.
  return `${formatStageChangeMessage(input)}. ${action} by a manager: ${neutralizeDiscordMentions(input.reason)}`;
}
