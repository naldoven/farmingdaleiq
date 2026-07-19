import Link from "next/link";
import { Plus } from "lucide-react";

import { KanbanBoard } from "@/components/catering/kanban-board";
import type { OrderCardData } from "@/components/catering/order-card";
import { SectionCard, SectionLabel, StatusBadge } from "@/components/mobile";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { storeLocalDate, type OrderStage } from "@/app/(app)/catering/logic";

/**
 * /catering pipeline board (ARCHITECTURE.md page map: "Order pipeline board:
 * stage columns, drag/dropdown moves, new-order intake"). A "new order came
 * in" strip highlights today's intake.
 */
export const metadata = { title: "Catering" };

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
      // Active pipeline only: closed and cancelled (CAT1) orders are terminal
      // and drop off the board.
      .neq("stage", "closed")
      .neq("stage", "cancelled")
      .order("event_date"),
    supabase
      .from("catering_orders")
      .select("id, guest_name")
      .gte("created_at", `${today}T00:00:00`)
      .order("created_at", { ascending: false }),
  ]);

  // Checklist completion per order drives each card's progress bar. Fetched
  // as a second query (rather than joined into the first) since it only
  // needs order ids, which the first query already resolved.
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: checklistCounts } = orderIds.length
    ? await supabase.from("catering_checklist_items").select("order_id, done").in("order_id", orderIds)
    : { data: [] as { order_id: string; done: boolean }[] };

  const progressByOrder = new Map<string, { done: number; total: number }>();
  for (const row of checklistCounts ?? []) {
    const existing = progressByOrder.get(row.order_id) ?? { done: 0, total: 0 };
    existing.total += 1;
    if (row.done) existing.done += 1;
    progressByOrder.set(row.order_id, existing);
  }

  const cards: OrderCardData[] = (orders ?? []).map((o) => {
    const progress = progressByOrder.get(o.id);
    return {
      id: o.id,
      guestName: o.guest_name,
      eventDate: o.event_date,
      eventTime: o.event_time,
      headcount: o.headcount,
      amount: o.amount,
      fulfillment: o.fulfillment,
      stage: o.stage as OrderStage,
      checklistDone: progress?.done,
      checklistTotal: progress?.total,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel
        action={
          canManage ? (
            <Link
              href="/catering/new"
              aria-label="New catering order"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white shadow-card transition-transform active:scale-95"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      >
        Pipeline
      </SectionLabel>

      {(todaysIntake ?? []).length > 0 && (
        <SectionCard title="New orders today">
          <div className="flex flex-wrap gap-2">
            {(todaysIntake ?? []).map((o) => (
              <Link key={o.id} href={`/catering/orders/${o.id}`}>
                <StatusBadge tone="accent">{o.guest_name}</StatusBadge>
              </Link>
            ))}
          </div>
        </SectionCard>
      )}

      <KanbanBoard orders={cards} />
    </div>
  );
}
