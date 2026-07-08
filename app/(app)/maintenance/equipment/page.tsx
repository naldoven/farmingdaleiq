import { EquipmentList } from "@/components/maintenance/equipment-list";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /maintenance/equipment — equipment registry (ARCHITECTURE.md "Equipment
 * registry").
 */
export default async function EquipmentPage() {
  await requirePermission("maintenance.request");
  const canManage = await hasPermission("maintenance.manage");

  const supabase = await createClient();

  const [{ data: equipment }, { data: vendors }] = await Promise.all([
    supabase.from("equipment").select("id, name, category, area, status, service_vendor_id").order("name"),
    supabase.from("vendors").select("id, name").eq("active", true).order("name"),
  ]);

  const vendorNameById = new Map((vendors ?? []).map((v) => [v.id, v.name]));

  const rows = (equipment ?? []).map((eq) => ({
    id: eq.id,
    name: eq.name,
    category: eq.category,
    area: eq.area,
    status: eq.status,
    service_vendor_name: eq.service_vendor_id ? (vendorNameById.get(eq.service_vendor_id) ?? null) : null,
  }));

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <EquipmentList equipment={rows} vendorOptions={vendors ?? []} canManage={canManage} />
    </div>
  );
}
