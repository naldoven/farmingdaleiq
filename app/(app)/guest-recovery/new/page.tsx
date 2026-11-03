import { notFound } from "next/navigation";

import { loadActiveMenu } from "@/app/(app)/guest-recovery/queries";
import { NewRecoveryForm } from "@/components/guest-recovery/new-recovery-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewGuestRecoveryPage() {
  if (!(await hasPermission("guest_recovery.log"))) notFound();

  const supabase = await createClient();
  const menu = await loadActiveMenu(supabase);

  return (
    <div className="mx-auto max-w-[480px]">
      <NewRecoveryForm menu={menu} />
    </div>
  );
}
