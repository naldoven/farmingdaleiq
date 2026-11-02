import { notFound } from "next/navigation";

import { TOKEN_PATTERN } from "@/app/(app)/guest-recovery/constants";
import { loadRecovery } from "@/app/(app)/guest-recovery/queries";
import { daysOwed, statusLabel, summarizeChannel } from "@/app/(app)/guest-recovery/view";
import { RecoveryActions } from "@/components/guest-recovery/recovery-actions";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { hasPermission } from "@/lib/auth/permissions";
import { buildSms, formatItems, recoveryLink } from "@/lib/guest-recovery/messages";
import { resolveBaseUrl } from "@/lib/guest-recovery/base-url";
import { createClient } from "@/lib/supabase/server";
import { formatStoreDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * The redeem screen: where a scanned code lands for a signed-in leader. It says
 * plainly what the guest is owed, to ask for the receipt, and whether it was
 * already handed over, so a second scan explains itself.
 */
export default async function GuestRecoveryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  if (!(await hasPermission("guest_recovery.log"))) notFound();

  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = await createClient();
  const recovery = await loadRecovery(supabase, id);
  if (!recovery) notFound();

  const now = new Date();
  const owed = recovery.status === "owed";
  const baseUrl = await resolveBaseUrl();
  const link = baseUrl && TOKEN_PATTERN.test(recovery.token) ? recoveryLink(baseUrl, recovery.token) : null;
  const smsText =
    link && recovery.guestPhone
      ? buildSms({ guestName: recovery.guestName, orderNumber: recovery.orderNumber, items: recovery.items, link })
      : null;

  const email = summarizeChannel("email", recovery.sends, Boolean(recovery.guestEmail), now);
  const text = summarizeChannel("sms", recovery.sends, Boolean(recovery.guestPhone), now);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      {notice && (
        <p role="status" className="rounded-xl bg-info-soft p-3 text-[15px] font-medium text-ink">
          {notice.slice(0, 200)}
        </p>
      )}

      {!owed && (
        <p
          role="status"
          className={
            recovery.status === "given"
              ? "rounded-xl bg-warning-soft p-3 text-[15px] font-semibold"
              : "rounded-xl bg-danger-soft p-3 text-[15px] font-semibold text-danger"
          }
        >
          {recovery.status === "given"
            ? `Already handed over ${formatStoreDateTime(recovery.givenAt)}. Do not give it again.`
            : `Voided ${formatStoreDateTime(recovery.voidedAt)}. Nothing is owed.`}
        </p>
      )}

      <SectionCard>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[22px] font-bold text-ink">{recovery.guestName}</h2>
          <StatusBadge tone={owed ? "warning" : recovery.status === "given" ? "success" : "neutral"}>
            {statusLabel(recovery.status)}
          </StatusBadge>
        </div>
        <p className="mt-3 text-[13px] text-muted-ink">Owed</p>
        <ul className="mt-1 space-y-1">
          {recovery.items.map((item) => (
            <li key={item.id} className="text-[19px] font-semibold text-accent-ink">
              {formatItems([item])}
            </li>
          ))}
        </ul>
        {owed && (
          <p className="mt-4 rounded-lg bg-warning-soft p-3 text-[14px] font-semibold">
            Ask for the receipt. Redeemable at this store only.
          </p>
        )}
        <dl className="mt-4 space-y-2 text-[15px]">
          {recovery.orderNumber && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-ink">Order</dt>
              <dd>#{recovery.orderNumber}</dd>
            </div>
          )}
          {recovery.note && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-ink">Note</dt>
              <dd className="text-right">{recovery.note}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-ink">Logged</dt>
            <dd className="text-right">
              {formatStoreDateTime(recovery.createdAt)} by {recovery.loggedByName}
              {owed && daysOwed(recovery.createdAt, now) >= 7 ? " (over a week ago)" : ""}
            </dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Contact">
        <dl className="space-y-2 text-[15px]">
          {recovery.guestPhone && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-ink">Phone</dt>
              <dd>
                <a href={`tel:${recovery.guestPhone}`} className="font-semibold text-accent-ink underline">
                  {recovery.guestPhone}
                </a>
              </dd>
            </div>
          )}
          {recovery.guestEmail && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-ink">Email</dt>
              <dd className="break-all text-right">{recovery.guestEmail}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-ink">Email status</dt>
            <dd className="text-right">{email.label}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-ink">Text status</dt>
            <dd className="text-right">
              {recovery.guestPhone && !recovery.smsConsent ? "No text (guest did not agree)" : text.label}
            </dd>
          </div>
        </dl>
      </SectionCard>

      <RecoveryActions
        id={recovery.id}
        owed={owed}
        canEmail={Boolean(recovery.guestEmail)}
        canText={Boolean(recovery.guestPhone) && recovery.smsConsent}
        link={link}
        smsText={smsText}
      />
    </div>
  );
}
