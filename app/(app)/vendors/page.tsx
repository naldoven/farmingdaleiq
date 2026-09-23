import { VendorDirectory } from "@/components/vendors/vendor-directory";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /vendors — vendor contact directory (ARCHITECTURE.md "Vendors": "Directory:
 * vendor name, category, rep contact info, account number, website, and
 * notes"). Editing lives at /vendors-settings so tapping a vendor opens contact
 * details instead of an edit form.
 */
export const metadata = { title: "Vendors" };

export default async function VendorsPage() {
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
      <VendorDirectory vendors={vendors ?? []} />
    </div>
  );
}
