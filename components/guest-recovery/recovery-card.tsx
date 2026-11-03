import Link from "next/link";

import { STALE_OWED_DAYS } from "@/app/(app)/guest-recovery/constants";
import type { RecoveryView } from "@/app/(app)/guest-recovery/types";
import {
  daysOwed,
  nothingReachedGuest,
  statusLabel,
  summarizeChannel,
  timeAgo,
} from "@/app/(app)/guest-recovery/view";
import { StatusBadge } from "@/components/mobile";
import { formatItems } from "@/lib/guest-recovery/messages";

/** One recovery on the list: guest, items, order, and whether the guest was reached. */
export function RecoveryCard({ recovery, now }: { recovery: RecoveryView; now: Date }) {
  const owed = recovery.status === "owed";
  const email = summarizeChannel("email", recovery.sends, Boolean(recovery.guestEmail), now);
  const text = summarizeChannel("sms", recovery.sends, Boolean(recovery.guestPhone), now);
  const stale = owed && daysOwed(recovery.createdAt, now) >= STALE_OWED_DAYS;
  const unreached = owed && nothingReachedGuest(recovery);

  return (
    <Link
      href={`/guest-recovery/${recovery.id}`}
      className="block rounded-xl bg-card p-4 shadow-card active:bg-canvas"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[17px] font-bold text-ink">{recovery.guestName}</p>
        <span className="shrink-0 text-[13px] text-muted-ink">{timeAgo(recovery.createdAt, now)}</span>
      </div>
      <p className="mt-1 text-[16px] font-semibold text-accent-ink">{formatItems(recovery.items)}</p>
      <p className="mt-1 text-[13px] text-muted-ink">
        {recovery.orderNumber ? `Order #${recovery.orderNumber} · ` : ""}
        Logged by {recovery.loggedByName}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!owed && (
          <StatusBadge tone={recovery.status === "given" ? "success" : "neutral"}>{statusLabel(recovery.status)}</StatusBadge>
        )}
        {unreached && <StatusBadge tone="danger">Guest not reached yet</StatusBadge>}
        {stale && <StatusBadge tone="warning">Over a week</StatusBadge>}
        {email.state === "sent" && <StatusBadge tone="success" dot>Emailed</StatusBadge>}
        {(email.state === "failed" || email.state === "unknown") && <StatusBadge tone="danger">Email problem</StatusBadge>}
        {text.state === "sent" && <StatusBadge tone="success" dot>Texted</StatusBadge>}
        {(text.state === "failed" || text.state === "unknown") && <StatusBadge tone="danger">Text problem</StatusBadge>}
      </div>
    </Link>
  );
}
