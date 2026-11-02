import Link from "next/link";

import { STALE_OWED_DAYS } from "@/app/(app)/guest-recovery/constants";
import { isExpired } from "@/app/(app)/guest-recovery/expiry";
import type { RecoveryView } from "@/app/(app)/guest-recovery/types";
import {
  assigneeLine,
  daysOwed,
  nothingReachedGuest,
  reasonLabel,
  repeatLabel,
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
  const spotlight = recovery.path === "spotlight";
  const expired = owed && !spotlight && isExpired(recovery.expiresAt, now);
  const repeat = repeatLabel(recovery.priorCount);
  const owner = assigneeLine(recovery.path, recovery.assignedToName, recovery.status);

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
        {reasonLabel(recovery.reason)} · Logged by {recovery.loggedByName}
      </p>
      {owner && <p className="mt-1 text-[13px] font-semibold text-ink">{owner}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!owed && (
          <StatusBadge tone={recovery.status === "given" ? "success" : "neutral"}>{statusLabel(recovery.status)}</StatusBadge>
        )}
        {expired && <StatusBadge tone="danger">Expired</StatusBadge>}
        {spotlight && owed && <StatusBadge tone="info">Chick-fil-A app guest</StatusBadge>}
        {repeat && <StatusBadge tone="warning">{repeat}</StatusBadge>}
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
