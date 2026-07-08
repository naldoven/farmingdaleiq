import Link from "next/link";

import { SectionCard, SectionLabel, StatusBadge } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { ORDER_STAGE_LABELS, currentWeekDates, type OrderStage } from "@/app/(app)/catering/logic";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * /catering/week — ARCHITECTURE.md page map: "This Week calendar of
 * upcoming orders" (day-by-day cards for staffing and prep planning).
 */
export default async function CateringWeekPage() {
  await requirePermission("catering.view");

  const dates = currentWeekDates();
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("catering_orders")
    .select("id, guest_name, event_date, event_time, headcount, stage")
    .gte("event_date", dates[0])
    .lte("event_date", dates[dates.length - 1])
    .order("event_time");

  const ordersByDate = new Map<string, NonNullable<typeof orders>>();
  for (const date of dates) ordersByDate.set(date, []);
  for (const order of orders ?? []) {
    ordersByDate.get(order.event_date)?.push(order);
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>This week</SectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
        {dates.map((date, i) => (
          <SectionCard key={date} title={`${WEEKDAY_SHORT[i]} ${date.slice(5)}`}>
            <div className="flex flex-col gap-2">
              {(ordersByDate.get(date) ?? []).map((order) => (
                <Link
                  key={order.id}
                  href={`/catering/orders/${order.id}`}
                  className="flex flex-col gap-1 rounded-xl border border-line p-2 text-[13px] hover:bg-secondary/60"
                >
                  <span className="font-semibold text-ink">{order.guest_name}</span>
                  <span className="text-muted-ink">
                    {order.event_time ?? "No time set"}
                    {order.headcount != null ? ` · ${order.headcount} guests` : ""}
                  </span>
                  <StatusBadge tone="neutral" className="w-fit">
                    {ORDER_STAGE_LABELS[order.stage as OrderStage]}
                  </StatusBadge>
                </Link>
              ))}
              {(ordersByDate.get(date) ?? []).length === 0 && (
                <p className="text-[13px] text-muted-ink">No orders.</p>
              )}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
