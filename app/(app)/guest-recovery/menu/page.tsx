import { notFound } from "next/navigation";

import type { MenuItemView } from "@/app/(app)/guest-recovery/types";
import { MenuManager } from "@/components/guest-recovery/menu-manager";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /guest-recovery/menu: leaders with guest_recovery.manage add items to the
 * recovery menu and hide or show the ones already there. Items are hidden,
 * never deleted, so old recoveries keep their names.
 */
export const metadata = { title: "Recovery menu" };

export default async function RecoveryMenuPage() {
  if (!(await hasPermission("guest_recovery.manage"))) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recovery_menu_items")
    .select("id, name, family, category, sort, active")
    .order("category")
    .order("sort");
  if (error) throw new Error(`Could not load the recovery menu: ${error.message}`);

  const items: MenuItemView[] = data ?? [];

  return (
    <div className="mx-auto max-w-[480px] space-y-4 px-4 pb-8 pt-4">
      <p className="text-[15px] text-muted-ink">
        These are the items a leader can pick when logging a missing order. Hide an item to take it
        off the list. Old recoveries keep their items.
      </p>
      <MenuManager items={items} />
    </div>
  );
}
