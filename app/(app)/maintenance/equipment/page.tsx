import { EquipmentList } from "@/components/maintenance/equipment-list";
import { SetupDefaultTag } from "@/components/settings/setup-default-tag";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getConfirmedAreas } from "@/lib/store-setup/status";

/**
 * /maintenance/equipment — equipment registry (ARCHITECTURE.md "Equipment
 * registry").
 */
export default async function EquipmentPage() {
  await requirePermission("maintenance.request");
  const canManage = await hasPermission("maintenance.manage");

  const supabase = await createClient();
  // Store setup tag (docs/STORE-SETUP.md): hidden once a manager confirms this area.
  const setupAreas = await getConfirmedAreas(supabase);

  const [equipmentResult, vendorsResult] = await Promise.all([
    supabase
      .from("equipment")
      .select("id, name, category, area, status, service_vendor_id")
      .order("name"),
    supabase
      .from("vendors")
      .select("id, name")
      .eq("active", true)
      .order("name"),
  ]);

  if (equipmentResult.error) {
    throw new Error(
      `Could not load equipment: ${equipmentResult.error.message}`,
    );
  }
  if (vendorsResult.error) {
    throw new Error(`Could not load vendors: ${vendorsResult.error.message}`);
  }

  const equipment = equipmentResult.data ?? [];
  const vendors = vendorsResult.data ?? [];
  const vendorNameById = new Map(vendors.map((v) => [v.id, v.name]));

  const rows = equipment.map((eq) => ({
    id: eq.id,
    name: eq.name,
    category: eq.category,
    area: eq.area,
    status: eq.status,
    service_vendor_name: eq.service_vendor_id ? (vendorNameById.get(eq.service_vendor_id) ?? null) : null,
  }));

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      {/* Service schedules live on each unit page; the tag sits here because
          this list is the way in (docs/STORE-SETUP.md, equipment_pm). */}
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-ink">
        <SetupDefaultTag area="equipment_pm" confirmed={setupAreas.keys} />
        {!setupAreas.keys.has("equipment_pm") && <span>Service schedules: open a unit to add one.</span>}
      </div>
      <EquipmentList equipment={rows} vendorOptions={vendors} canManage={canManage} />
    </div>
  );
}
