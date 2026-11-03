import { notFound } from "next/navigation";

import { GuestRecoveryTabs } from "@/components/guest-recovery/section-tabs";
import { QrScanner } from "@/components/guest-recovery/qr-scanner";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * Scan a guest's recovery QR inside the app. Leaders only: the scan opens the
 * redeem screen, which shows the guest's details.
 */
export default async function ScanGuestRecoveryPage() {
  if (!(await hasPermission("guest_recovery.log"))) notFound();

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <GuestRecoveryTabs group="recoveries" />
      <QrScanner />
    </div>
  );
}
