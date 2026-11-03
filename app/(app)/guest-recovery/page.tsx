import { notFound } from "next/navigation";

import { loadRecoveryList } from "@/app/(app)/guest-recovery/queries";
import { RecoveryList } from "@/components/guest-recovery/recovery-list";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Guest Recovery list (ARCHITECTURE.md "Guest Recovery"): still owed first,
 * recently closed below. Holds guest names and order numbers, so it needs
 * guest_recovery.log; RLS on the tables re-checks the same key.
 */
export default async function GuestRecoveryPage() {
  if (!(await hasPermission("guest_recovery.log"))) notFound();

  const supabase = await createClient();
  const now = new Date();
  const { owed, recent } = await loadRecoveryList(supabase, now);

  return (
    <div className="mx-auto max-w-[480px]">
      <RecoveryList owed={owed} recent={recent} nowIso={now.toISOString()} />
    </div>
  );
}
