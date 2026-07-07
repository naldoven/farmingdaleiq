import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChecklistSection } from "@/components/catering/checklist-section";
import { StageSelect } from "@/components/catering/stage-select";
import { createClient } from "@/lib/supabase/server";
import type { ChecklistStage, OrderStage } from "@/app/(app)/catering/logic";

/**
 * Shared queue view for /catering/confirm, /catering/setup, /catering/
 * dispatch (ARCHITECTURE.md: "stage work queues... that show only orders
 * sitting in that stage"). Each order shows its matching per-stage
 * checklist inline plus the stage dropdown to advance it.
 */
export async function StageQueue({
  orderStage,
  checklistStage,
}: {
  orderStage: OrderStage;
  checklistStage: ChecklistStage;
}) {
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
        .select("id, order_id, label, done")
        .in("order_id", orderIds)
        .eq("stage", checklistStage)
        .order("sort")
    : { data: [] as { id: string; order_id: string; label: string; done: boolean }[] };

  if ((orders ?? []).length === 0) {
    return <p className="text-sm text-muted-foreground">No orders in this stage.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {(orders ?? []).map((order) => (
        <Card key={order.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div>
              <CardTitle className="text-base">
                <Link href={`/catering/orders/${order.id}`} className="hover:underline">
                  {order.guest_name}
                </Link>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {order.event_date} {order.event_time ?? ""}
                {order.headcount != null ? ` — ${order.headcount} guests` : ""}
                {order.fulfillment ? ` — ${order.fulfillment}` : ""}
              </p>
            </div>
            <StageSelect orderId={order.id} stage={orderStage} />
          </CardHeader>
          <CardContent>
            <ChecklistSection
              orderId={order.id}
              stage={checklistStage}
              items={(checklistItems ?? [])
                .filter((c) => c.order_id === order.id)
                .map((c) => ({ id: c.id, label: c.label, done: c.done }))}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
