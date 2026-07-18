import { VendorManager } from "@/components/maintenance/vendor-manager";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /vendors — vendor directory (ARCHITECTURE.md "Vendors": "Read access for
 * everyone; manage access gated by permission"). vendors.view is a base
 * permission granted to every seeded role; vendors.manage gates create/edit/
 * deactivate, enforced both here (hiding the controls) and server-side in
 * app/(app)/vendors/actions.ts + RLS.
 */
export const metadata = { title: "Vendors" };

export default async function VendorsPage() {
  await requirePermission("vendors.view");
  const canManage = await hasPermission("vendors.manage");

  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select(
      "id, name, category, rep_name, phone, email, account_number, delivery_days, website, notes, active",
    )
    .order("name");

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <VendorManager vendors={vendors ?? []} canManage={canManage} />
    </div>
  );
}
