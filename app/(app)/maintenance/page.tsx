import { ListRow, SectionCard, StatusBadge, type StatusTone } from "@/components/mobile";
import { MaintenanceTabs } from "@/components/maintenance/maintenance-tabs";
import { RequestForm } from "@/components/maintenance/request-form";
import { TriageQueue } from "@/components/maintenance/triage-queue";
import { WorkOrderList, type WorkOrderRow } from "@/components/maintenance/work-order-list";
import { CreateWorkOrderForm } from "@/app/(app)/maintenance/create-work-order-form";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const REQUEST_STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  declined: "danger",
};

/**
 * /maintenance — submit a request, triage the queue, and see the work order
 * board (ARCHITECTURE.md "Maintenance (modeled on UpKeep)"). Every signed-in
 * team member holds maintenance.request (base permission); the Triage tab
 * only renders for maintenance.triage+.
 *
 * Restyled to the KitchenIQ mobile pattern (docs/DESIGN-SYSTEM.md): the
 * shadcn underline Tabs became a ChipRow of FilterChips (MaintenanceTabs),
 * each tab's list content lives inside a white SectionCard of ListRows with
 * StatusBadge status, and work order creation is a round accent "+".
 */
export const metadata = { title: "Maintenance" };

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
  const requestRows = myRequests ?? [];

  const tabs = [
    {
      id: "board",
      label: `Work orders (${openCount})`,
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[13px] font-semibold text-muted-ink">{openCount} open</p>
            {canTriage && (
              <CreateWorkOrderForm
                equipmentOptions={equipment ?? []}
                assigneeOptions={profiles ?? []}
                vendorOptions={vendors ?? []}
              />
            )}
          </div>
          <WorkOrderList workOrders={workOrderRows} />
        </div>
      ),
    },
    ...(canTriage
      ? [
          {
            id: "triage",
            label: `Triage (${pendingRequests?.length ?? 0})`,
            content: (
              <TriageQueue
                requests={pendingRequests ?? []}
                assigneeOptions={profiles ?? []}
                vendorOptions={vendors ?? []}
              />
            ),
          },
        ]
      : []),
    {
      id: "submit",
      label: "Submit request",
      content: (
        <SectionCard title="Submit a maintenance request">
          <RequestForm equipmentOptions={equipment ?? []} />
        </SectionCard>
      ),
    },
    {
      id: "my-requests",
      label: `My requests (${requestRows.length})`,
      content:
        requestRows.length === 0 ? (
          <p className="px-1 text-[13px] text-muted-ink">You haven&apos;t submitted any requests yet.</p>
        ) : (
          <SectionCard flush>
            <div className="divide-y divide-line">
              {requestRows.map((request) => {
                const detail =
                  request.status === "declined" && request.declined_reason
                    ? request.declined_reason
                    : request.status === "approved" && request.work_order_id
                      ? "Converted to a work order — see Work orders."
                      : new Date(request.submitted_at).toLocaleDateString();
                return (
                  <ListRow
                    key={request.id}
                    title={request.title}
                    description={detail}
                    trailing={
                      <StatusBadge tone={REQUEST_STATUS_TONE[request.status] ?? "neutral"}>
                        {request.status}
                      </StatusBadge>
                    }
                  />
                );
              })}
            </div>
          </SectionCard>
        ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <MaintenanceTabs tabs={tabs} defaultTab="board" />
    </div>
  );
}
