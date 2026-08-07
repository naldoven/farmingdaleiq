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
      .select("id, title, description, equipment_id, priority, status, created_at")
      .in("status", ["open", "in_progress", "on_hold"])
      .order("created_at", { ascending: false }),
  ]);
  const loadError = equipmentResult.error ?? workOrdersResult.error;
  if (loadError) throw new Error(`Could not load the maintenance log: ${loadError.message}`);

  const equipmentById = new Map((equipmentResult.data ?? []).map((equipment) => [equipment.id, equipment]));
  const publicWorkOrders: PublicWorkOrder[] = (workOrdersResult.data ?? []).map((order) => ({
    id: order.id,
    title: order.title,
    description: order.description,
    status: order.status as PublicWorkOrder["status"],
    priority: order.priority as PublicWorkOrder["priority"],
    area: order.equipment_id ? (equipmentById.get(order.equipment_id)?.area ?? null) : null,
    equipmentName: order.equipment_id ? (equipmentById.get(order.equipment_id)?.name ?? null) : null,
    createdAt: order.created_at,
  }));

  return (
    <PublicMaintenanceLog
      equipmentOptions={(equipmentResult.data ?? []).map((equipment) => ({ id: equipment.id, name: equipment.name }))}
      workOrders={publicWorkOrders}
    />
  );
}
