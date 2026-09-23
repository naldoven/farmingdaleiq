import { VendorSettingsManager } from "@/components/vendors/vendor-settings-manager";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /vendors-settings — management surface for the vendor directory. Naldo wants
 * everyone who can access Vendors to be able to add, edit, deactivate,
 * reactivate, and delete unlinked vendors, so this page is gated by
 * vendors.view and the server actions/RLS mirror that rule.
 */
export const metadata = { title: "Vendor Settings" };

export default async function VendorSettingsPage() {
  await requirePermission("vendors.view");

  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select(
      "id, name, category, rep_name, phone, email, account_number, website, notes, active",
    )
    .order("name");

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <VendorSettingsManager vendors={vendors ?? []} />
    </div>
  );
}
