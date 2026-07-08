import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RequestForm } from "@/components/maintenance/request-form";
import { TriageQueue } from "@/components/maintenance/triage-queue";
import { WorkOrderList, type WorkOrderRow } from "@/components/maintenance/work-order-list";
import { CreateWorkOrderForm } from "@/app/(app)/maintenance/create-work-order-form";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const REQUEST_STATUS_VARIANT: Record<string, "default" | "outline" | "secondary" | "success" | "destructive"> = {
  pending: "secondary",
  approved: "success",
  declined: "destructive",
};

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // These reads are all base-permission-visible (maintenance.request /
  // people.view / vendors.view are granted to every seeded role), so they're
  // fetched unconditionally; only the Triage tab's UI is gated on canTriage.
  const [
    { data: equipment },
    { data: workOrders },
    { data: pendingRequests },
    { data: profiles },
    { data: vendors },
    { data: myRequests },
  ] = await Promise.all([
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
    // Requester-facing resolution view (ARCHITECTURE.md "Requests": "any
    // team member submits a maintenance request and is notified as its
    // status changes"): unlike the triage queue above (pending only), this
    // covers every status so a requester can see what happened to a
    // request once a leader has approved or declined it.
    user
      ? supabase
          .from("maintenance_requests")
          .select("id, title, status, declined_reason, submitted_at, work_order_id")
          .eq("submitted_by", user.id)
          .order("submitted_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
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
          <TabsTrigger value="my-requests">My requests ({myRequests?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Work orders</CardTitle>
              {canTriage && (
                <CreateWorkOrderForm
                  equipmentOptions={equipment ?? []}
                  assigneeOptions={profiles ?? []}
                  vendorOptions={vendors ?? []}
                />
              )}
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

        <TabsContent value="my-requests">
          <Card>
            <CardHeader>
              <CardTitle>My requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(myRequests ?? []).map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.title}</TableCell>
                      <TableCell>
                        <Badge variant={REQUEST_STATUS_VARIANT[request.status] ?? "outline"}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(request.submitted_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {request.status === "declined" && request.declined_reason
                          ? request.declined_reason
                          : request.status === "approved" && request.work_order_id
                            ? "Converted to a work order — see Work orders."
                            : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(myRequests ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        You haven&apos;t submitted any requests yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
