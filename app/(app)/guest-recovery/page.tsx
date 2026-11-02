import { notFound } from "next/navigation";

import { loadRecoveryList, loadRecoverySettings } from "@/app/(app)/guest-recovery/queries";
import { OverseerToggle } from "@/components/guest-recovery/overseer-toggle";
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
  const [{ owed, recent }, settings, manager, userResult] = await Promise.all([
    loadRecoveryList(supabase, now),
    loadRecoverySettings(supabase),
    hasPermission("guest_recovery.manage"),
    supabase.auth.getUser(),
  ]);
  const viewerId = userResult.data.user?.id ?? null;
  const isOverseer = viewerId !== null && settings.overseerId === viewerId;

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      {(settings.overseerId || manager) && (
        <OverseerToggle
          overseerName={settings.overseerName}
          off={settings.overseerOff}
          canToggle={Boolean(settings.overseerId) && (isOverseer || manager)}
        />
      )}
      <RecoveryList owed={owed} recent={recent} nowIso={now.toISOString()} viewerId={viewerId} />
    </div>
  );
}
