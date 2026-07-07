import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeAnalytics } from "@/app/(app)/catering/logic";

/**
 * /catering/analytics — ARCHITECTURE.md page map: "Catering volume, revenue,
 * busiest days, top guests." All figures are computed from catering_orders
 * / catering_contacts, never stored.
 */
export default async function CateringAnalyticsPage() {
  await requirePermission("catering.view");

  const supabase = await createClient();
  const [{ data: orders }, { data: contacts }] = await Promise.all([
    supabase.from("catering_orders").select("id, contact_id, amount, event_date"),
    supabase.from("catering_contacts").select("id, name"),
  ]);

  const analytics = computeAnalytics(orders ?? [], contacts ?? []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Catering analytics</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total orders</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{analytics.totalOrders}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            ${analytics.totalRevenue.toFixed(2)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Average order</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            ${analytics.averageOrder.toFixed(2)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Repeat guests</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {analytics.repeatGuestPercentage.toFixed(0)}%
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by week</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.revenueByWeek.map((w) => (
                <TableRow key={w.week}>
                  <TableCell>{w.week}</TableCell>
                  <TableCell>${w.revenue.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {analytics.revenueByWeek.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Busiest days</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.busiestDays.map((d) => (
                  <TableRow key={d.day}>
                    <TableCell>{d.day}</TableCell>
                    <TableCell>{d.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top guests</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Guest</TableHead>
                  <TableHead>Spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.topGuests.map((g) => (
                  <TableRow key={g.contactId}>
                    <TableCell>{g.name}</TableCell>
                    <TableCell>${g.lifetimeSpend.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {analytics.topGuests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      No guests yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
