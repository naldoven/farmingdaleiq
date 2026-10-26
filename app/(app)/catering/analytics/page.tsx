import { DriverScorecardSection } from "@/components/catering/driver-scorecard-section";
import { HScroll, ListRow, SectionCard, SectionLabel, StatTile } from "@/components/mobile";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { storeLocalDate } from "@/lib/time";
import { driverWeekHref, driverWeekTitle, resolveDriverWeek } from "@/app/(app)/catering/analytics/driver-week";
import { loadDriverScorecard, type ScorecardView } from "@/app/(app)/catering/drivers/queries";
import { computeAnalytics, filterRevenueOrders } from "@/app/(app)/catering/logic";

/**
 * /catering/analytics — ARCHITECTURE.md page map: "Catering volume, revenue,
 * busiest days, top guests." All figures are computed from catering_orders
 * / catering_contacts, never stored. The Driver reservations section at the
 * end is the weekly scorecard; `?driverWeek=YYYY-MM-DD` picks its week.
 */
export default async function CateringAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("catering.view");
  // The scorecard names which leaders missed reservations, so it is for the
  // leaders who hold catering.drivers, not every crew member who can see
  // catering. RLS on catering_driver_reminders enforces the same line.
  const showScorecard = await hasPermission("catering.drivers");

  const params = await searchParams;
  const driverWeekParam = Array.isArray(params.driverWeek) ? params.driverWeek[0] : params.driverWeek;
  const week = resolveDriverWeek(driverWeekParam, storeLocalDate());

  const supabase = await createClient();
  const [{ data: orders }, { data: contacts }, scorecard] = await Promise.all([
    // Excludes stage "new" (unconfirmed, not real revenue yet) and "cancelled"
    // (CAT1) via the shared NON_REVENUE_STAGES filter, so analytics agrees with
    // /catering/history and the order-detail guest-history box.
    supabase.from("catering_orders").select("id, contact_id, amount, event_date, stage"),
    supabase.from("catering_contacts").select("id, name"),
    // The scorecard is an add-on to a page that already worked: if it can't
    // load, say so inside its own card and leave the rest of Analytics alone.
    showScorecard
      ? loadDriverScorecard(supabase, week.range).catch((error): ScorecardView | null => {
          console.error("catering analytics: could not load the driver scorecard", error);
          return null;
        })
      : Promise.resolve(null),
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

      {showScorecard && (
        <DriverScorecardSection
          title={driverWeekTitle(week.range)}
          card={scorecard}
          prevHref={driverWeekHref(params, week.prevDate)}
          nextHref={week.nextDate ? driverWeekHref(params, week.nextDate) : null}
        />
      )}
    </div>
  );
}
