import { NewOrderForm } from "@/components/catering/new-order-form";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/** New catering order intake form, reached from the pipeline board. */
export default async function NewCateringOrderPage() {
  await requirePermission("catering.manage");

  const supabase = await createClient();
  const { data: menuItems } = await supabase
    .from("catering_menu_items")
    .select("id, name")
    .eq("active", true)
    .order("name");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">New catering order</h1>
      <NewOrderForm menuItems={menuItems ?? []} />
    </div>
  );
}
