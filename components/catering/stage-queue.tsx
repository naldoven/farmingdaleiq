import Link from "next/link";

import { SectionCard, StatusBadge } from "@/components/mobile";
import { ChecklistSection } from "@/components/catering/checklist-section";
import { DriverStatusBadge } from "@/components/catering/driver-status";
import { OrderSetupSection } from "@/components/catering/order-setup-section";
import { StageSelect } from "@/components/catering/stage-select";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { loadDriverBadges } from "@/app/(app)/catering/driver-badges";
import {
  isConfirmationCallLate,
  type ChecklistStage,
  type OrderStage,
} from "@/app/(app)/catering/logic";

/**
 * Shared queue view for /catering/confirm, /catering/setup, /catering/
 * dispatch (ARCHITECTURE.md: "stage work queues... that show only orders
 * sitting in that stage"). Each order is a card with its matching per-stage
 * checklist inline plus the stage dropdown to advance it. Delivery orders also
 * show who is driving (or "Needs driver"), in every queue they pass through.
 */
export async function StageQueue({
  orderStage,
  checklistStage,
}: {
  orderStage: OrderStage;
  checklistStage: ChecklistStage;
}) {
  const canManage = await hasPermission("catering.manage");
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("catering_orders")
    .select("id, guest_name, event_date, event_time, headcount, fulfillment")
    .eq("stage", orderStage)
    .order("event_date");

  const orderIds = (orders ?? []).map((o) => o.id);
  // Started before the checklist read so the two run together; it never rejects.
  const driversRequest = loadDriverBadges(
    supabase,
    (orders ?? []).map((o) => ({ id: o.id, fulfillment: o.fulfillment, stage: orderStage })),
  );
  const { data: checklistItems } = orderIds.length
    ? await supabase
        .from("catering_checklist_items")
        .select("id, order_id, label, done, setup_section")
        .in("order_id", orderIds)
        .eq("stage", checklistStage)
        .order("sort")
    : {
        data: [] as {
          id: string;
          order_id: string;
          label: string;
          done: boolean;
          setup_section: string | null;
        }[],
      };

  const driversByOrder = await driversRequest;

  if ((orders ?? []).length === 0) {
    return <p className="text-[13px] text-muted-ink">No orders in this stage.</p>;
  }

  // Only the Confirmation Calls queue can show the badge: the helper is false
  // for every stage after Confirmation Call. On that queue `checklistItems`
  // is already the Confirmation Call rows, so the badge needs no extra query.
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      {(orders ?? []).map((order) => (
        <SectionCard
          key={order.id}
          title={
            <Link href={`/catering/orders/${order.id}`} className="hover:underline">
              {order.guest_name}
            </Link>
          }
          action={<StageSelect orderId={order.id} stage={orderStage} canManage={canManage} />}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {isConfirmationCallLate(
                { stage: orderStage, event_date: order.event_date },
                checklistStage === "confirm"
                  ? (checklistItems ?? []).filter((item) => item.order_id === order.id)
                  : [],
                now,
              ) && (
                <StatusBadge tone="warning">Call not done</StatusBadge>
              )}
              <p className="text-[13px] text-muted-ink">
                {order.event_date} {order.event_time ?? ""}
                {order.headcount != null ? ` · ${order.headcount} guests` : ""}
                {order.fulfillment ? ` · ${order.fulfillment}` : ""}
              </p>
              {driversByOrder.has(order.id) && <DriverStatusBadge drivers={driversByOrder.get(order.id) ?? []} />}
            </div>
            {checklistStage === "setup" ? (
              <>
                <OrderSetupSection
                  canManage={canManage}
                  variant="bare"
                  items={(checklistItems ?? [])
                    .filter((item) => item.order_id === order.id && item.setup_section !== null)
                    .map((item) => ({
                      id: item.id,
                      label: item.label,
                      done: item.done,
                      setupSection: item.setup_section,
                    }))}
                />
                {(checklistItems ?? []).some(
                  (item) => item.order_id === order.id && item.setup_section === null,
                ) && (
                  <ChecklistSection
                    orderId={order.id}
                    stage="setup"
                    variant="bare"
                    canManage={canManage}
                    items={(checklistItems ?? [])
                      .filter((item) => item.order_id === order.id && item.setup_section === null)
                      .map((item) => ({ id: item.id, label: item.label, done: item.done }))}
                  />
                )}
              </>
            ) : (
              <ChecklistSection
                orderId={order.id}
                stage={checklistStage}
                variant="bare"
                canManage={canManage}
                items={(checklistItems ?? [])
                  .filter((item) => item.order_id === order.id)
                  .map((item) => ({ id: item.id, label: item.label, done: item.done }))}
              />
            )}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
