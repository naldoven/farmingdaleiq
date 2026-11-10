import { notFound } from "next/navigation";

import {
  FAULT_LABELS,
  SPOTLIGHT_PROMISE_HOURS,
  SPOTLIGHT_REWARD_LIMIT,
  TOKEN_PATTERN,
  spotlightTemplateFor,
} from "@/app/(app)/guest-recovery/constants";
import { expiryLine, isExpired } from "@/app/(app)/guest-recovery/expiry";
import { loadRecovery, loadWorkers } from "@/app/(app)/guest-recovery/queries";
import {
  assigneeLine,
  daysOwed,
  reasonLabel,
  repeatLabel,
  statusLabel,
  summarizeChannel,
} from "@/app/(app)/guest-recovery/view";
import { RecoveryActions } from "@/components/guest-recovery/recovery-actions";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { hasPermission } from "@/lib/auth/permissions";
import { resolveBaseUrl } from "@/lib/guest-recovery/base-url";
import { buildSms, formatItems, recoveryLink } from "@/lib/guest-recovery/messages";
import { createClient } from "@/lib/supabase/server";
import { formatStoreDate, formatStoreDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * The redeem screen: where a scanned code lands for a signed-in leader. It says
 * plainly what the guest is owed, to ask for the receipt, and whether it was
 * already handed over, so a second scan explains itself. An expired code never
 * errors: it shows the same guest and items under a large red EXPIRED banner,
 * and handing it over takes a second confirming tap.
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
  const spotlight = recovery.path === "spotlight";
  // A Spotlight guest has no code, so there is nothing to expire.
  const expired = owed && !spotlight && isExpired(recovery.expiresAt, now);

  const [workers, manager, userResult] = await Promise.all([
    spotlight && owed ? loadWorkers(supabase) : Promise.resolve([]),
    hasPermission("guest_recovery.manage"),
    supabase.auth.getUser(),
  ]);
  const userId = userResult.data.user?.id ?? null;
  const canAssign = spotlight && owed && (manager || recovery.assignedTo === null || recovery.assignedTo === userId);

  const baseUrl = await resolveBaseUrl();
  const link =
    !spotlight && baseUrl && TOKEN_PATTERN.test(recovery.token) ? recoveryLink(baseUrl, recovery.token) : null;
  const smsText =
    link && recovery.guestPhone
      ? buildSms({
          guestName: recovery.guestName,
          orderNumber: recovery.orderNumber,
          items: recovery.items,
          link,
          goodUntil: `Good until ${formatStoreDate(recovery.expiresAt)}`,
        })
      : null;

  const email = summarizeChannel("email", recovery.sends, Boolean(recovery.guestEmail), now);
  const text = summarizeChannel("sms", recovery.sends, Boolean(recovery.guestPhone), now);
  const repeat = repeatLabel(recovery.priorCount);
  const owner = assigneeLine(recovery.path, recovery.assignedToName, recovery.status);

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      {notice && (
        <p role="status" className="rounded-xl bg-info-soft p-3 text-[15px] font-medium text-ink">
          {notice.slice(0, 200)}
        </p>
      )}

      {expired && (
        <div role="alert" className="rounded-xl border-2 border-danger bg-danger-soft p-4 text-center">
          <p className="text-[28px] font-extrabold leading-none tracking-wide text-danger">EXPIRED</p>
          <p className="mt-1 text-[15px] font-semibold text-danger">{expiryLine(recovery.expiresAt, now)}</p>
          <p className="mt-1 text-[14px] text-ink">Check with a manager before handing it over.</p>
        </div>
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
        <div className="mt-2 flex flex-wrap gap-2">
          {spotlight && <StatusBadge tone="info">Chick-fil-A app guest</StatusBadge>}
          <StatusBadge tone="neutral">{reasonLabel(recovery.reason)}</StatusBadge>
          {repeat && <StatusBadge tone="warning">{repeat}</StatusBadge>}
        </div>
        <p className="mt-3 text-[13px] text-muted-ink">Owed</p>
        <ul className="mt-1 space-y-1">
          {recovery.items.map((item) => (
            <li key={item.id} className="text-[19px] font-semibold text-accent-ink">
              {formatItems([item])}
              {item.faultSource && (
                <span className="mt-0.5 block text-[13px] font-medium text-muted-ink">
                  Likely cause: {FAULT_LABELS[item.faultSource]}
                </span>
              )}
            </li>
          ))}
        </ul>
        {owed && !spotlight && (
          <p className="mt-4 rounded-lg bg-warning-soft p-3 text-[14px] font-semibold">
            Ask for the receipt. Redeemable at this store only.
          </p>
        )}
        {owed && spotlight && (
          <p className="mt-4 rounded-lg bg-info-soft p-3 text-[14px] font-semibold">
            Send this guest their reward from Spotlight (Care, then Respond). They were told it
            comes within {SPOTLIGHT_PROMISE_HOURS} hours. {owner}.
            <span className="mt-2 block font-normal">
              Email template to pick: {spotlightTemplateFor(recovery.reason)}. If it was a delivery
              service order, pick Third-Party Order Complaint with Offer instead.
            </span>
            <span className="mt-2 block font-normal">
              Set the reward to expire on {formatStoreDate(recovery.expiresAt)}. The message the guest
              got says it is good until that date.
            </span>
            {recovery.items.length > SPOTLIGHT_REWARD_LIMIT && (
              <span className="mt-2 block font-normal">
                Spotlight sends up to {SPOTLIGHT_REWARD_LIMIT} rewards at a time. This guest is owed{" "}
                {recovery.items.length} items, so send the rest in a second round.
              </span>
            )}
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
          {owed && !spotlight && !expired && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-ink">Code</dt>
              <dd className="text-right">{expiryLine(recovery.expiresAt, now)}</dd>
            </div>
          )}
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
        path={recovery.path}
        expired={expired}
        expiredOn={formatStoreDate(recovery.expiresAt)}
        canEmail={Boolean(recovery.guestEmail)}
        canText={Boolean(recovery.guestPhone) && recovery.smsConsent}
        link={link}
        smsText={smsText}
        workers={workers}
        assignedTo={recovery.assignedTo}
        canAssign={canAssign}
      />
    </div>
  );
}
