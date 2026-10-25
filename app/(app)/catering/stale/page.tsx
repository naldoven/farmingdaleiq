import { StaleOrdersCloser, type StaleOrderRow } from "@/components/catering/stale-orders-closer";
import { SectionLabel } from "@/components/mobile";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { storeLocalDate } from "@/lib/time";
import { STALE_CLOSABLE_STAGES, type OrderStage } from "@/app/(app)/catering/logic";

/**
 * /catering/stale: manager cleanup for past-event orders nobody worked. On
 * 2026-10-25, 172 of them had to be closed by hand in the database; this
 * screen lets a manager do the same in under a minute, with a reason on every
 * order's audit trail. Gated on catering.override (the nav item carries the
 * same key, so leaders without it never see the link), and the close button
 * also needs catering.manage because the write goes through the normal
 * catering_orders RLS policy.
 */
export const metadata = { title: "Stale catering orders" };

export default async function StaleCateringOrdersPage() {
  await requirePermission("catering.override");
  const canManage = await hasPermission("catering.manage");

  const supabase = await createClient();
  // Store-day boundary, not the server's UTC clock: an order for tonight is
  // not stale at 9 PM New York even though it is already tomorrow in UTC.
  const today = storeLocalDate(new Date());

  const { data: orders } = await supabase
    .from("catering_orders")
    .select("id, guest_name, event_date, event_time, headcount, stage")
    .lt("event_date", today)
    .in("stage", [...STALE_CLOSABLE_STAGES])
    .order("event_date", { ascending: false });

  const rows: StaleOrderRow[] = (orders ?? []).map((order) => ({
    id: order.id,
    guestName: order.guest_name,
    eventDate: order.event_date,
    eventTime: order.event_time,
    headcount: order.headcount,
    stage: order.stage as OrderStage,
  }));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <SectionLabel>Stale orders</SectionLabel>
      <p className="text-[13px] text-muted-ink">
        Orders whose event date has passed and that never reached Closed. Closing them here logs your reason on
        each order, posts nothing to Discord, and queues no re-book calls.
      </p>
      <StaleOrdersCloser orders={rows} canClose={canManage} />
    </div>
  );
}
