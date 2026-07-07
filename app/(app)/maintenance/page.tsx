import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequestForm } from "@/components/maintenance/request-form";
import { TriageQueue } from "@/components/maintenance/triage-queue";
import { WorkOrderList, type WorkOrderRow } from "@/components/maintenance/work-order-list";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /maintenance — submit a request, triage the queue, and see the work order
 * board (ARCHITECTURE.md "Maintenance (modeled on UpKeep)"). Every signed-in
 * team member holds maintenance.request (base permission); the Triage tab
 * only renders for maintenance.triage+.
 */
export default async function MaintenancePage() {
  await requirePermission("maintenance.request");
  const canTriage = await hasPermission("maintenance.triage");

  const supabase = await createClient();

  // These reads are all base-permission-visible (maintenance.request /
  // people.view / vendors.view are granted to every seeded role), so they're
  // fetched unconditionally; only the Triage tab's UI is gated on canTriage.
  const [{ data: equipment }, { data: workOrders }, { data: pendingRequests }, { data: profiles }, { data: vendors }] =
    await Promise.all([
      supabase.from("equipment").select("id, name").order("name"),
      supabase
        .from("work_orders")
        .select("id, title, status, priority, equipment_id, assigned_user_id, vendor_id, due_at, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("maintenance_requests")
        .select("id, title, description, area, suggested_priority, submitted_at")
        .eq("status", "pending")
        .order("submitted_at"),
      supabase.from("profiles").select("id, name").eq("active", true).order("name"),
      supabase.from("vendors").select("id, name").eq("active", true).order("name"),
    ]);

  const equipmentNameById = new Map((equipment ?? []).map((e) => [e.id, e.name]));
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, v.name]));

  const workOrderRows: WorkOrderRow[] = (workOrders ?? []).map((wo) => ({
    id: wo.id,
    title: wo.title,
    status: wo.status,
    priority: wo.priority,
    equipment_name: wo.equipment_id ? (equipmentNameById.get(wo.equipment_id) ?? null) : null,
    assigned_user_name: wo.assigned_user_id ? (profileNameById.get(wo.assigned_user_id) ?? null) : null,
    vendor_name: wo.vendor_id ? (vendorNameById.get(wo.vendor_id) ?? null) : null,
    due_at: wo.due_at,
  }));

  const openCount = workOrderRows.filter((wo) => wo.status !== "complete" && wo.status !== "cancelled").length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Maintenance</h1>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Work orders ({openCount})</TabsTrigger>
          {canTriage && <TabsTrigger value="triage">Triage queue ({pendingRequests?.length ?? 0})</TabsTrigger>}
          <TabsTrigger value="submit">Submit request</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <Card>
            <CardHeader>
              <CardTitle>Work orders</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <WorkOrderList workOrders={workOrderRows} />
            </CardContent>
          </Card>
        </TabsContent>

        {canTriage && (
          <TabsContent value="triage">
            <Card>
              <CardHeader>
                <CardTitle>Pending requests</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <TriageQueue
                  requests={pendingRequests ?? []}
                  assigneeOptions={profiles ?? []}
                  vendorOptions={vendors ?? []}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="submit">
          <Card>
            <CardHeader>
              <CardTitle>Submit a maintenance request</CardTitle>
            </CardHeader>
            <CardContent>
              <RequestForm equipmentOptions={equipment ?? []} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
