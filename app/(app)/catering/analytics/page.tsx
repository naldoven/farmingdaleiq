import { HScroll, ListRow, SectionCard, SectionLabel, StatTile } from "@/components/mobile";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeAnalytics, filterRevenueOrders } from "@/app/(app)/catering/logic";

/**
 * /catering/analytics — ARCHITECTURE.md page map: "Catering volume, revenue,
 * busiest days, top guests." All figures are computed from catering_orders
 * / catering_contacts, never stored.
 */
export default async function CateringAnalyticsPage() {
  await requirePermission("catering.view");

  const supabase = await createClient();
  const [{ data: orders }, { data: contacts }] = await Promise.all([
    // Excludes stage "new" (unconfirmed, not real revenue yet) and "cancelled"
    // (CAT1) via the shared NON_REVENUE_STAGES filter, so analytics agrees with
    // /catering/history and the order-detail guest-history box.
    supabase.from("catering_orders").select("id, contact_id, amount, event_date, stage"),
    supabase.from("catering_contacts").select("id, name"),
  ]);

  const analytics = computeAnalytics(filterRevenueOrders(orders ?? []), contacts ?? []);

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>Analytics</SectionLabel>

      <HScroll>
        <StatTile value={analytics.totalOrders} label="Total orders" />
        <StatTile value={`$${analytics.totalRevenue.toFixed(2)}`} label="Total revenue" tone="success" />
        <StatTile value={`$${analytics.averageOrder.toFixed(2)}`} label="Average order" />
        <StatTile value={`${analytics.repeatGuestPercentage.toFixed(0)}%`} label="Repeat guests" />
      </HScroll>

      <SectionCard title="Revenue by week" flush>
        <div className="divide-y divide-line">
          {analytics.revenueByWeek.map((w) => (
            <ListRow key={w.week} title={w.week} trailing={<span className="text-[15px] font-semibold text-ink">${w.revenue.toFixed(2)}</span>} />
          ))}
          {analytics.revenueByWeek.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-muted-ink">No orders yet.</p>
          )}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SectionCard title="Busiest days" flush>
          <div className="divide-y divide-line">
            {analytics.busiestDays.map((d) => (
              <ListRow key={d.day} title={d.day} trailing={<span className="text-[15px] font-semibold text-ink">{d.count}</span>} />
            ))}
            {analytics.busiestDays.length === 0 && (
              <p className="px-4 py-3 text-[13px] text-muted-ink">No orders yet.</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Top guests" flush>
          <div className="divide-y divide-line">
            {analytics.topGuests.map((g) => (
              <ListRow
                key={g.contactId}
                title={g.name}
                description={`${g.orderCount} order(s)`}
                trailing={<span className="text-[15px] font-semibold text-ink">${g.lifetimeSpend.toFixed(2)}</span>}
              />
            ))}
            {analytics.topGuests.length === 0 && (
              <p className="px-4 py-3 text-[13px] text-muted-ink">No guests yet.</p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
