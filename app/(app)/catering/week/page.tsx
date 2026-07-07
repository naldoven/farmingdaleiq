import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">This week</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
        {dates.map((date, i) => (
          <Card key={date}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {WEEKDAY_SHORT[i]} {date.slice(5)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {(ordersByDate.get(date) ?? []).map((order) => (
                <Link
                  key={order.id}
                  href={`/catering/orders/${order.id}`}
                  className="flex flex-col gap-1 rounded-md border border-border p-2 text-xs hover:bg-accent"
                >
                  <span className="font-medium">{order.guest_name}</span>
                  <span className="text-muted-foreground">
                    {order.event_time ?? "No time set"}
                    {order.headcount != null ? ` — ${order.headcount} guests` : ""}
                  </span>
                  <Badge variant="outline" className="w-fit">
                    {ORDER_STAGE_LABELS[order.stage as OrderStage]}
                  </Badge>
                </Link>
              ))}
              {(ordersByDate.get(date) ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No orders.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
