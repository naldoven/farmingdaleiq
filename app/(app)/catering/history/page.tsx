import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FollowUpResolveForm } from "@/components/catering/followup-resolve-form";
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

  const rollups = computeContactRollups(allOrders ?? []);

  let periodOrdersQuery = supabase
    .from("catering_orders")
    .select("id, guest_name, amount, event_date, stage")
    .lte("event_date", to)
    .order("event_date", { ascending: false });
  if (from) periodOrdersQuery = periodOrdersQuery.gte("event_date", from);
  const { data: periodOrders } = await periodOrdersQuery;

  const guestNameByOrderId = new Map((allOrders ?? []).map((o) => [o.id, o.guest_name]));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Catering history</h1>

      <Card>
        <CardHeader>
          <CardTitle>Follow-ups due</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Due</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(openFollowUps ?? []).map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Link href={`/catering/orders/${f.order_id}`} className="text-primary hover:underline">
                      {guestNameByOrderId.get(f.order_id) ?? "Order"}
                    </Link>
                  </TableCell>
                  <TableCell>{f.due_on ?? "—"}</TableCell>
                  <TableCell>
                    <FollowUpResolveForm id={f.id} />
                  </TableCell>
                </TableRow>
              ))}
              {(openFollowUps ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No follow-ups due.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Lifetime spend</TableHead>
                <TableHead>Last event</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(contacts ?? []).map((c) => {
                const rollup = rollups.get(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                    <TableCell>{rollup?.orderCount ?? 0}</TableCell>
                    <TableCell>${(rollup?.lifetimeSpend ?? 0).toFixed(2)}</TableCell>
                    <TableCell>{rollup?.lastEventDate ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
              {(contacts ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No contacts yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order history</CardTitle>
          <div className="flex gap-2 pt-2">
            {HISTORY_PERIODS.map((p) => (
              <Button key={p} asChild variant={p === period ? "default" : "outline"} size="sm">
                <Link href={`/catering/history?period=${p}`}>{p}</Link>
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Event date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Stage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(periodOrders ?? []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/catering/orders/${o.id}`} className="text-primary hover:underline">
                      {o.guest_name}
                    </Link>
                  </TableCell>
                  <TableCell>{o.event_date}</TableCell>
                  <TableCell>{o.amount != null ? `$${o.amount.toFixed(2)}` : "—"}</TableCell>
                  <TableCell>{ORDER_STAGE_LABELS[o.stage as OrderStage]}</TableCell>
                </TableRow>
              ))}
              {(periodOrders ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No orders in this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
