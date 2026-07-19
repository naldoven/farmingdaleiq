import Link from "next/link";
import { notFound } from "next/navigation";

import { CancelOrderButton } from "@/components/catering/cancel-order-button";
import { ChecklistSection } from "@/components/catering/checklist-section";
import { OrderDetailsForm } from "@/components/catering/order-details-form";
import { OrderItemEditor } from "@/components/catering/order-item-editor";
import { RescaleButton } from "@/components/catering/rescale-button";
import { StageSelect } from "@/components/catering/stage-select";
import { SectionCard, SectionLabel, StatusBadge } from "@/components/mobile";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  CANCELLED_STAGE,
  CHECKLIST_STAGES,
  ORDER_STAGE_LABELS,
  filterRevenueOrders,
  type ChecklistStage,
  type OrderStage,
} from "@/app/(app)/catering/logic";

/**
 * /catering/orders/[id] — ARCHITECTURE.md page map: "Order detail: items,
 * stage, all checklists, notes, guest history." Not a top-level nav route
 * (reached from the pipeline board or a stage queue), same convention as
 * /people/[id].
 */
export default async function CateringOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("catering.view");
  const canManage = await hasPermission("catering.manage");
  const { id } = await params;

  const supabase = await createClient();

  const [
    { data: order },
    { data: orderItems },
    { data: activeMenuItems },
    { data: allMenuItems },
    { data: checklistItems },
  ] = await Promise.all([
    supabase
      .from("catering_orders")
      .select(
        "id, guest_name, phone, email, event_date, event_time, headcount, amount, stage, fulfillment, delivery_address, paper_goods, notes, contact_id",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("catering_order_items")
      .select("id, menu_item_id, qty")
      .eq("order_id", id),
    // Active-only: the "add item to this order" picker in OrderItemEditor
    // should only ever offer items still on the catalog.
    supabase.from("catering_menu_items").select("id, name").eq("active", true).order("name"),
    // Unfiltered: the name-lookup for items already on this order must find
    // deactivated items too, or an order placed before a menu item was
    // retired shows "Unknown item" forever (parity audit Catering finding:
    // "Order detail shows 'Unknown item' for deactivated menu items" --
    // deactivation, not deletion, is the documented way to retire an item).
    supabase.from("catering_menu_items").select("id, name"),
    supabase
      .from("catering_checklist_items")
      .select("id, stage, label, done")
      .eq("order_id", id)
      .order("sort"),
  ]);

  if (!order) {
    notFound();
  }

  const menuItemNameById = new Map((allMenuItems ?? []).map((m) => [m.id, m.name]));
  const itemRows = (orderItems ?? []).map((i) => ({
    id: i.id,
    menuItemId: i.menu_item_id,
    menuItemName: menuItemNameById.get(i.menu_item_id) ?? "Unknown item",
    qty: i.qty,
  }));

  let contactHistory: { orderCount: number; lifetimeSpend: number } | null = null;
  if (order.contact_id) {
    const { data: contactOrders } = await supabase
      .from("catering_orders")
      .select("amount, stage")
      .eq("contact_id", order.contact_id);
    // CAT4: apply the same NON_REVENUE_STAGES exclusion the analytics/history
    // rollups use, so a guest's order count and lifetime spend match across
    // every screen instead of this box counting unconfirmed "new" and
    // "cancelled" orders the other screens drop.
    const countable = filterRevenueOrders(contactOrders ?? []);
    contactHistory = {
      orderCount: countable.length,
      lifetimeSpend: countable.reduce((sum, o) => sum + (o.amount ?? 0), 0),
    };
  }

  const itemsByStage = (stage: ChecklistStage) =>
    (checklistItems ?? [])
      .filter((c) => c.stage === stage)
      .map((c) => ({ id: c.id, label: c.label, done: c.done }));

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel
        action={
          <div className="flex items-center gap-2">
            <StatusBadge tone={order.stage === CANCELLED_STAGE ? "neutral" : "accent"}>
              {ORDER_STAGE_LABELS[order.stage as OrderStage]}
            </StatusBadge>
            <StageSelect orderId={order.id} stage={order.stage as OrderStage} />
            {canManage && order.stage !== CANCELLED_STAGE && (
              <CancelOrderButton orderId={order.id} />
            )}
          </div>
        }
      >
        {order.guest_name}
      </SectionLabel>
      <p className="-mt-3 text-[13px] text-muted-ink">
        {order.event_date} {order.event_time ?? ""}
      </p>

      {contactHistory && (
        <SectionCard>
          <p className="text-[15px] text-ink">
            Guest history: {contactHistory.orderCount} order(s), $
            {contactHistory.lifetimeSpend.toFixed(2)} lifetime spend.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Order details">
        <OrderDetailsForm
          order={{
            id: order.id,
            guestName: order.guest_name,
            phone: order.phone,
            email: order.email,
            eventDate: order.event_date,
            eventTime: order.event_time,
            headcount: order.headcount,
            amount: order.amount,
            fulfillment: order.fulfillment,
            deliveryAddress: order.delivery_address,
            paperGoods: order.paper_goods,
            notes: order.notes,
          }}
        />
      </SectionCard>

      <SectionCard title="Menu items">
        <OrderItemEditor orderId={order.id} items={itemRows} menuItems={activeMenuItems ?? []} />
      </SectionCard>

      <div className="flex items-center justify-between">
        <h2 className="text-[19px] font-semibold text-ink">Stage checklists</h2>
        <RescaleButton orderId={order.id} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CHECKLIST_STAGES.map((stage) => (
          <ChecklistSection key={stage} orderId={order.id} stage={stage} items={itemsByStage(stage)} />
        ))}
      </div>

      <Link href="/catering" className="text-[13px] font-semibold text-accent hover:underline">
        Back to pipeline
      </Link>
    </div>
  );
}
