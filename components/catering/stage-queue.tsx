import Link from "next/link";

import { SectionCard } from "@/components/mobile";
import { ChecklistSection } from "@/components/catering/checklist-section";
import { OrderSetupSection } from "@/components/catering/order-setup-section";
import { StageSelect } from "@/components/catering/stage-select";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ChecklistStage, OrderStage } from "@/app/(app)/catering/logic";

/**
 * Shared queue view for /catering/confirm, /catering/setup, /catering/
 * dispatch (ARCHITECTURE.md: "stage work queues... that show only orders
 * sitting in that stage"). Each order is a card with its matching per-stage
 * checklist inline plus the stage dropdown to advance it.
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

  if ((orders ?? []).length === 0) {
    return <p className="text-[13px] text-muted-ink">No orders in this stage.</p>;
  }

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
          action={<StageSelect orderId={order.id} stage={orderStage} />}
        >
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-muted-ink">
              {order.event_date} {order.event_time ?? ""}
              {order.headcount != null ? ` · ${order.headcount} guests` : ""}
              {order.fulfillment ? ` · ${order.fulfillment}` : ""}
            </p>
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
