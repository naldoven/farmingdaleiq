import { ListRow, SectionCard, SectionLabel } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  CANCELLED_STAGE,
  cancelledOnLabel,
  cancelledOrderDetails,
} from "@/app/(app)/catering/logic";

/**
 * /catering/cancelled: every cancelled order, newest cancellation first.
 * Cancelled orders drop off the pipeline board, This Week and the stage
 * queues, so this is the one list a manager can reach Restore from without
 * already holding the order's link. Restore itself lives on the order page
 * (StageOverrideControls) and needs catering.override; this page only reads,
 * so catering.view is the whole gate.
 */
export default async function CateringCancelledPage() {
  await requirePermission("catering.view");

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("catering_orders")
    .select("id, guest_name, event_date, headcount, fulfillment, stage_changed_at, created_at")
    .eq("stage", CANCELLED_STAGE)
    // stage_changed_at is nullable, so a row without a stamp sorts last
    // instead of first, and created_at keeps ties in a stable order.
    .order("stage_changed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <SectionLabel>Cancelled orders</SectionLabel>
      <p className="-mt-3 text-[13px] text-muted-ink">
        Open an order to see its details. A manager can restore it from the order page.
      </p>

      <SectionCard flush>
        <div className="divide-y divide-line">
          {(orders ?? []).map((order) => (
            <ListRow
              key={order.id}
              href={`/catering/orders/${order.id}`}
              title={order.guest_name}
              description={
                <>
                  {cancelledOrderDetails(order)}
                  <span className="block">{cancelledOnLabel(order.stage_changed_at)}</span>
                </>
              }
            />
          ))}
          {(orders ?? []).length === 0 && (
            <p className="px-4 py-3 text-[13px] text-muted-ink">No cancelled orders.</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
