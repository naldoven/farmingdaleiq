import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KanbanBoard } from "@/components/catering/kanban-board";
import type { OrderCardData } from "@/components/catering/order-card";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { storeLocalDate, type OrderStage } from "@/app/(app)/catering/logic";

/**
 * /catering pipeline board (ARCHITECTURE.md page map: "Order pipeline board:
 * stage columns, drag/dropdown moves, new-order intake"). A "new order came
 * in" strip highlights today's intake.
 */
export default async function CateringPipelinePage() {
  await requirePermission("catering.view");
  const canManage = await hasPermission("catering.manage");

  const supabase = await createClient();

  // Store-timezone "today", not the server's UTC clock (parity audit
  // Catering finding: "Today/period boundaries computed in UTC, not store
  // timezone" -- Eastern rollovers were 4-5h early).
  const { data: store } = await supabase.from("stores").select("timezone").limit(1).maybeSingle();
  const today = storeLocalDate(new Date(), store?.timezone || "America/New_York");

  const [{ data: orders }, { data: todaysIntake }] = await Promise.all([
    supabase
      .from("catering_orders")
      .select("id, guest_name, event_date, event_time, headcount, amount, fulfillment, stage")
      .neq("stage", "closed")
      .order("event_date"),
    supabase
      .from("catering_orders")
      .select("id, guest_name")
      .gte("created_at", `${today}T00:00:00`)
      .order("created_at", { ascending: false }),
  ]);

  const cards: OrderCardData[] = (orders ?? []).map((o) => ({
    id: o.id,
    guestName: o.guest_name,
    eventDate: o.event_date,
    eventTime: o.event_time,
    headcount: o.headcount,
    amount: o.amount,
    fulfillment: o.fulfillment,
    stage: o.stage as OrderStage,
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Catering pipeline</h1>
        {canManage && (
          <Button asChild>
            <Link href="/catering/new">New order</Link>
          </Button>
        )}
      </div>

      {(todaysIntake ?? []).length > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">New orders today</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(todaysIntake ?? []).map((o) => (
              <Link key={o.id} href={`/catering/orders/${o.id}`}>
                <Badge variant="default">{o.guest_name}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <KanbanBoard orders={cards} />
    </div>
  );
}
