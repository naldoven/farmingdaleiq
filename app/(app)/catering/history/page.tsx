import Link from "next/link";

import { FollowUpResolveForm } from "@/components/catering/followup-resolve-form";
import { HistoryPeriodFilter } from "@/components/catering/history-period-filter";
import { ListRow, SectionCard, SectionLabel, StatusBadge } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  HISTORY_PERIODS,
  ORDER_STAGE_LABELS,
  computeContactRollups,
  periodRange,
  type HistoryPeriod,
  type OrderStage,
} from "@/app/(app)/catering/logic";

/**
 * /catering/history — ARCHITECTURE.md page map: "Contacts, follow-ups due,
 * order history with period filters." Contact rollups (order count,
 * lifetime spend, last event date) are always computed from orders, never
 * stored.
 */
export default async function CateringHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission("catering.view");
  const { period: periodParam } = await searchParams;
  const period: HistoryPeriod = HISTORY_PERIODS.includes(periodParam as HistoryPeriod)
    ? (periodParam as HistoryPeriod)
    : "month";

  const supabase = await createClient();
  const { from, to } = periodRange(period);

  const [{ data: allOrders }, { data: contacts }, { data: openFollowUps }] = await Promise.all([
    supabase.from("catering_orders").select("id, contact_id, guest_name, amount, event_date, stage"),
    supabase.from("catering_contacts").select("id, name, phone, email"),
    supabase
      .from("catering_followups")
      .select("id, order_id, due_on, contact_id")
      .is("done_at", null)
      .order("due_on"),
  ]);

  // Excludes stage "new" from the Contacts rollup (order count/lifetime
  // spend/last event): an unconfirmed order isn't real spend yet (parity
  // audit Catering finding: "Analytics/history include every order
  // regardless of stage -- unconfirmed New orders count in revenue"). The
  // guest-name lookup below still uses the unfiltered allOrders list, and
  // the Order history list further down intentionally lists every stage
  // (including "new") since it displays each row's own stage already.
  const rollups = computeContactRollups((allOrders ?? []).filter((o) => o.stage !== "new"));

  let periodOrdersQuery = supabase
    .from("catering_orders")
    .select("id, guest_name, amount, event_date, stage")
    .lte("event_date", to)
    .order("event_date", { ascending: false });
  if (from) periodOrdersQuery = periodOrdersQuery.gte("event_date", from);
  const { data: periodOrders } = await periodOrdersQuery;

  const guestNameByOrderId = new Map((allOrders ?? []).map((o) => [o.id, o.guest_name]));

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>History</SectionLabel>

      <SectionCard title="Follow-ups due" flush>
        <div className="divide-y divide-line">
          {(openFollowUps ?? []).map((f) => (
            <ListRow
              key={f.id}
              title={
                <Link href={`/catering/orders/${f.order_id}`} className="hover:underline">
                  {guestNameByOrderId.get(f.order_id) ?? "Order"}
                </Link>
              }
              description={f.due_on ? `Due ${f.due_on}` : "Due date not set"}
              trailing={<FollowUpResolveForm id={f.id} />}
            />
          ))}
          {(openFollowUps ?? []).length === 0 && (
            <p className="px-4 py-3 text-[13px] text-muted-ink">No follow-ups due.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard title={`Contacts (${(contacts ?? []).length})`} flush>
        <div className="divide-y divide-line">
          {(contacts ?? []).map((c) => {
            const rollup = rollups.get(c.id);
            return (
              <ListRow
                key={c.id}
                title={c.name}
                description={c.phone ?? c.email ?? "No contact info"}
                trailing={
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-[15px] font-semibold text-ink">
                      ${(rollup?.lifetimeSpend ?? 0).toFixed(2)}
                    </span>
                    <span className="text-[13px] text-muted-ink">
                      {rollup?.orderCount ?? 0} order(s)
                    </span>
                  </div>
                }
              />
            );
          })}
          {(contacts ?? []).length === 0 && (
            <p className="px-4 py-3 text-[13px] text-muted-ink">No contacts yet.</p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Order history">
        <div className="flex flex-col gap-3">
          <HistoryPeriodFilter period={period} />
          <div className="-mx-4 divide-y divide-line">
            {(periodOrders ?? []).map((o) => (
              <ListRow
                key={o.id}
                href={`/catering/orders/${o.id}`}
                title={o.guest_name}
                description={o.event_date}
                trailing={
                  <div className="flex flex-col items-end gap-0.5">
                    {o.amount != null && (
                      <span className="text-[15px] font-semibold text-ink">
                        ${o.amount.toFixed(2)}
                      </span>
                    )}
                    <StatusBadge tone="neutral">{ORDER_STAGE_LABELS[o.stage as OrderStage]}</StatusBadge>
                  </div>
                }
              />
            ))}
            {(periodOrders ?? []).length === 0 && (
              <p className="px-4 py-3 text-[13px] text-muted-ink">No orders in this period.</p>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
