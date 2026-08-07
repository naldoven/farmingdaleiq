import {
  ListRow,
  SectionCard,
  StatusBadge,
  type StatusTone,
} from "@/components/mobile";
import { EquipmentList } from "@/components/maintenance/equipment-list";
import { MaintenanceTabs } from "@/components/maintenance/maintenance-tabs";
import { RequestForm } from "@/components/maintenance/request-form";
import { TriageQueue } from "@/components/maintenance/triage-queue";
import {
  WorkOrderBoard,
  type WorkOrderRow,
} from "@/components/maintenance/work-order-board";
import { CreateWorkOrderForm } from "@/app/(app)/maintenance/create-work-order-form";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatStoreDate } from "@/lib/time";

const REQUEST_STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  declined: "danger",
};

function mergePhotoUrls(
  ...groups: Array<string[] | null | undefined>
): string[] {
  return Array.from(
    new Set(
      groups
        .flatMap((group) => group ?? [])
        .filter((url): url is string => Boolean(url)),
    ),
  );
}

/**
 * /maintenance — submit a request, triage the queue, and see the work order
 * board (ARCHITECTURE.md "Maintenance (modeled on UpKeep)"). The whole
 * section is trainer-and-above: maintenance.request was removed from the
 * below-trainer roles in 20260803120000_maintenance_request_trainer_up.sql;
 * the Triage tab only renders for maintenance.triage+.
 *
 * Restyled to the KitchenIQ mobile pattern (docs/DESIGN-SYSTEM.md): the
 * shadcn underline Tabs became a ChipRow of FilterChips (MaintenanceTabs),
 * each tab's list content lives inside a white SectionCard of ListRows with
 * StatusBadge status, and work order creation is a round accent "+".
 */
export const metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  await requirePermission("maintenance.request");
  const [canTriage, canManageEquipment] = await Promise.all([
    hasPermission("maintenance.triage"),
    hasPermission("maintenance.manage"),
  ]);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Everyone who can reach this page (maintenance.request holders) can also
  // read all of this — people.view / vendors.view are granted to every
  // seeded role — so it's fetched unconditionally; only the Triage tab's UI
  // is gated on canTriage.
  const [
    equipmentResult,
    workOrdersResult,
    pendingRequestsResult,
    profilesResult,
    vendorsResult,
    myRequestsResult,
  ] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, name, category, area, status, service_vendor_id")
      .order("name"),
    supabase
      .from("work_orders")
      .select(
        "id, request_id, title, status, priority, equipment_id, assigned_user_id, vendor_id, photo_urls, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("maintenance_requests")
      .select(
        "id, title, description, area, suggested_priority, photo_urls, submitted_at",
      )
      .eq("status", "pending")
      .order("submitted_at"),
    supabase
      .from("profiles")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    supabase
      .from("vendors")
      .select("id, name")
      .eq("active", true)
      .order("name"),
    // Requester-facing resolution view (ARCHITECTURE.md "Requests": "any
    // team member submits a maintenance request and is notified as its
    // status changes"): unlike the triage queue above (pending only), this
    // covers every status so a requester can see what happened to a
    // request once a leader has approved or declined it.
    user
      ? supabase
          .from("maintenance_requests")
          .select(
            "id, title, status, declined_reason, submitted_at, work_order_id",
          )
          .eq("submitted_by", user.id)
          .order("submitted_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const loadError = [
    equipmentResult.error,
    workOrdersResult.error,
    pendingRequestsResult.error,
    profilesResult.error,
    vendorsResult.error,
    myRequestsResult.error,
  ].find(Boolean);
  if (loadError) {
    throw new Error(`Could not load maintenance data: ${loadError.message}`);
  }

  const equipment = equipmentResult.data ?? [];
  const workOrders = workOrdersResult.data ?? [];
  const pendingRequests = pendingRequestsResult.data ?? [];
  const profiles = profilesResult.data ?? [];
  const vendors = vendorsResult.data ?? [];
  const myRequests = myRequestsResult.data ?? [];

  const equipmentOptions = equipment.map((eq) => ({
    id: eq.id,
    name: eq.name,
  }));
  const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));
  const equipmentRows = equipment.map((eq) => ({
    id: eq.id,
    name: eq.name,
    category: eq.category,
    area: eq.area,
    status: eq.status,
    service_vendor_name: eq.service_vendor_id
      ? (vendorNameById.get(eq.service_vendor_id) ?? null)
      : null,
  }));
  const equipmentNameById = new Map(equipmentOptions.map((e) => [e.id, e.name]));
  const profileNameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  const workOrderRequestIds = Array.from(
    new Set(
      workOrders
        .map((wo) => wo.request_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: workOrderRequests, error: workOrderRequestsError } =
    workOrderRequestIds.length > 0
      ? await supabase
          .from("maintenance_requests")
          .select("id, photo_urls")
          .in("id", workOrderRequestIds)
      : { data: [], error: null };
  if (workOrderRequestsError) {
    throw new Error(
      `Could not load work order request photos: ${workOrderRequestsError.message}`,
    );
  }
  const requestPhotosById = new Map(
    (workOrderRequests ?? []).map((request) => [
      request.id,
      request.photo_urls ?? [],
    ]),
  );

  const workOrderRows: WorkOrderRow[] = workOrders.map((wo) => ({
    id: wo.id,
    title: wo.title,
    status: wo.status,
    priority: wo.priority,
    equipment_name: wo.equipment_id ? (equipmentNameById.get(wo.equipment_id) ?? null) : null,
    assigned_user_name: wo.assigned_user_id ? (profileNameById.get(wo.assigned_user_id) ?? null) : null,
    vendor_name: wo.vendor_id ? (vendorNameById.get(wo.vendor_id) ?? null) : null,
    photo_urls: mergePhotoUrls(
      wo.photo_urls,
      wo.request_id ? requestPhotosById.get(wo.request_id) : null,
    ),
  }));

  const openCount = workOrderRows.filter((wo) => wo.status !== "complete" && wo.status !== "cancelled").length;
  const requestRows = myRequests;

  const tabs = [
    {
      id: "board",
      label: `Work orders (${openCount})`,
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[13px] font-semibold text-muted-ink">{openCount} open</p>
            {canTriage && (
              <CreateWorkOrderForm equipmentOptions={equipmentOptions} />
            )}
          </div>
          <WorkOrderBoard workOrders={workOrderRows} />
        </div>
      ),
    },
    {
      id: "equipment",
      label: `Equipment (${equipmentRows.length})`,
      content: (
        <div className="mx-auto w-full lg:max-w-[480px]">
          <EquipmentList
            equipment={equipmentRows}
            vendorOptions={vendors}
            canManage={canManageEquipment}
          />
        </div>
      ),
    },
    ...(canTriage
      ? [
          {
            id: "triage",
            label: `Triage (${pendingRequests?.length ?? 0})`,
            content: (
              <div className="mx-auto w-full lg:max-w-[480px]">
                <TriageQueue
                  requests={pendingRequests ?? []}
                  assigneeOptions={profiles ?? []}
                  vendorOptions={vendors ?? []}
                />
              </div>
            ),
          },
        ]
      : []),
    {
      id: "submit",
      label: "Submit request",
      content: (
        <div className="mx-auto w-full lg:max-w-[480px]">
          <SectionCard title="Submit a maintenance request">
            <RequestForm equipmentOptions={equipmentOptions} />
          </SectionCard>
        </div>
      ),
    },
    {
      id: "my-requests",
      label: `My requests (${requestRows.length})`,
      content:
        requestRows.length === 0 ? (
          <p className="px-1 text-[13px] text-muted-ink">You haven&apos;t submitted any requests yet.</p>
        ) : (
          <SectionCard flush className="mx-auto w-full lg:max-w-[480px]">
            <div className="divide-y divide-line">
              {requestRows.map((request) => {
                const detail =
                  request.status === "declined" && request.declined_reason
                    ? request.declined_reason
                    : request.status === "approved" && request.work_order_id
                      ? "Converted to a work order — see Work orders."
                      : formatStoreDate(request.submitted_at);
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
    // 480px phone-first like every page; lg+ widens to fit the Kanban's four
    // 272px columns side by side (non-board tabs re-cap themselves at 480px).
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 lg:max-w-[1140px]">
      <MaintenanceTabs tabs={tabs} defaultTab="board" />
    </div>
  );
}
