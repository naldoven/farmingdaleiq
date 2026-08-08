import type { Metadata } from "next";

import {
  PublicMaintenanceLog,
  type PublicWorkOrder,
} from "@/components/public-maintenance/maintenance-log";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Maintenance Log",
  description: "Report a maintenance problem and view current work.",
  robots: { index: false, follow: false },
};

// This unlisted page is a live operations log, not a cacheable marketing page.
export const dynamic = "force-dynamic";

export default async function PublicMaintenanceLogPage() {
  const supabase = createServiceRoleClient();
  const [equipmentResult, workOrdersResult] = await Promise.all([
    supabase.from("equipment").select("id, name, area").order("name"),
    supabase
      .from("work_orders")
      .select("id, request_id, title, description, equipment_id, photo_urls, priority, status, created_at")
      .in("status", ["open", "in_progress", "on_hold"])
      .order("created_at", { ascending: false }),
  ]);
  const loadError = equipmentResult.error ?? workOrdersResult.error;
  if (loadError) throw new Error(`Could not load the maintenance log: ${loadError.message}`);

  const equipmentById = new Map((equipmentResult.data ?? []).map((equipment) => [equipment.id, equipment]));
  const requestIds = Array.from(
    new Set((workOrdersResult.data ?? []).map((order) => order.request_id).filter((id): id is string => Boolean(id))),
  );
  const { data: workOrderRequests, error: workOrderRequestsError } = requestIds.length > 0
    ? await supabase.from("maintenance_requests").select("id, photo_urls").in("id", requestIds)
    : { data: [], error: null };
  if (workOrderRequestsError) {
    throw new Error(`Could not load work order request photos: ${workOrderRequestsError.message}`);
  }

  const requestPhotosById = new Map(
    (workOrderRequests ?? []).map((request) => [request.id, request.photo_urls ?? []]),
  );
  const publicWorkOrders: PublicWorkOrder[] = (workOrdersResult.data ?? []).map((order) => ({
    id: order.id,
    title: order.title,
    description: order.description,
    status: order.status as PublicWorkOrder["status"],
    priority: order.priority as PublicWorkOrder["priority"],
    area: order.equipment_id ? (equipmentById.get(order.equipment_id)?.area ?? null) : null,
    equipmentName: order.equipment_id ? (equipmentById.get(order.equipment_id)?.name ?? null) : null,
    photoUrls: Array.from(
      new Set([...(order.photo_urls ?? []), ...(order.request_id ? (requestPhotosById.get(order.request_id) ?? []) : [])]),
    ).filter((url): url is string => Boolean(url)),
    createdAt: order.created_at,
  }));

  return (
    <PublicMaintenanceLog
      equipmentOptions={(equipmentResult.data ?? []).map((equipment) => ({ id: equipment.id, name: equipment.name }))}
      workOrders={publicWorkOrders}
    />
  );
}
