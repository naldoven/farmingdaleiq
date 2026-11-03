import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MapPin, QrCode, Receipt } from "lucide-react";

import { SPOTLIGHT_PROMISE_HOURS, STORE_NAME, TOKEN_PATTERN } from "@/app/(app)/guest-recovery/constants";
import { expiryLine, isExpired } from "@/app/(app)/guest-recovery/expiry";
import { loadRecoveryIdByToken } from "@/app/(app)/guest-recovery/queries";
import { hasPermission } from "@/lib/auth/permissions";
import { firstNameOf, recoveryLink } from "@/lib/guest-recovery/messages";
import { resolveBaseUrl } from "@/lib/guest-recovery/base-url";
import { readConfig } from "@/lib/guest-recovery/providers";
import { qrSvg } from "@/lib/guest-recovery/qr";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { formatStoreDate } from "@/lib/time";

// The link is a secret: keep it out of search results and out of Referer headers.
export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: MapPin, label: "Visit us" },
  { icon: Receipt, label: "Bring your receipt" },
  { icon: QrCode, label: "Show this page" },
] as const;

/**
 * The page a guest opens from their email or text (ARCHITECTURE.md "Guest
 * Recovery"). Public, and the only thing that unlocks it is the 64-character
 * token in the address. It shows the guest's first name, what they are owed
 * and a QR of this same address, and nothing else: no email, phone, order
 * number, other guests or staff names. A signed-in leader who opens it (by
 * scanning the guest's QR) goes to the redeem screen instead.
 *
 * It matches the emails: the store's red page, one white card, and the words
 * "We are sorry, <name>. Let us make it right."
 */
export default async function RecoverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) notFound();

  if (await hasPermission("guest_recovery.log")) {
    const supabase = await createClient();
    const id = await loadRecoveryIdByToken(supabase, token);
    if (id) redirect(`/guest-recovery/${id}`);
  }

  const service = createServiceRoleClient();
  const { data: recovery } = await service
    .from("guest_recoveries")
    .select("id, guest_name, status, created_at, given_at, path, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!recovery) notFound();

  const { data: items } = await service
    .from("guest_recovery_items")
    .select("name, qty")
    .eq("recovery_id", recovery.id)
    .order("name");

  // The store number is a manager's setting; the variable is only a fallback.
  const { data: settings } = await service.from("guest_recovery_settings").select("store_phone").eq("id", true).maybeSingle();
  const storePhone = settings?.store_phone?.trim() || readConfig().storePhone;

  const baseUrl = await resolveBaseUrl();
  const svg = baseUrl && recovery.path !== "spotlight" ? await qrSvg(recoveryLink(baseUrl, token)) : null;

  const owed = recovery.status === "owed";
  const spotlight = recovery.path === "spotlight";
  const expired = owed && isExpired(recovery.expires_at);
  const rows = items ?? [];
  const goodUntil = !expired && recovery.expires_at ? `Good until ${formatStoreDate(recovery.expires_at)}` : null;

  return (
    <main className="min-h-dvh bg-accent px-5 pb-10 pt-7 text-white">
      <div className="mx-auto flex max-w-[440px] flex-col">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em]">{STORE_NAME}</p>
          {/* The white version of the mark, made for a red page. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/cfa-mark-white.png" alt="" width={44} height={44} className="size-11 shrink-0" />
        </div>

        <h1 className="mt-6 text-[38px] font-extrabold leading-[1.05]">
          We are sorry, {firstNameOf(recovery.guest_name)}. Let us make it right.
        </h1>
        <p className="mt-3 text-[16px] leading-snug">Here is what we owe you from your recent order.</p>

        {owed && expired && (
          <div role="alert" className="mt-6 rounded-2xl bg-card p-4 text-center text-ink">
            <p className="text-[22px] font-extrabold tracking-wide text-accent-ink">This code has expired</p>
            <p className="mt-1 text-[14px]">{expiryLine(recovery.expires_at)}. Ask a team member, they can still help.</p>
          </div>
        )}

        {owed ? (
          <section className="relative mt-8 rounded-3xl bg-card p-6 pt-7 text-ink">
            {goodUntil && (
              <p className="absolute -top-3.5 right-5 rounded-full border-[1.5px] border-accent bg-accent-soft px-3.5 py-1 text-[13px] font-bold text-accent-ink">
                {goodUntil}
              </p>
            )}
            <p className="text-[13px] text-muted-ink">We owe you</p>
            <ul className="mt-3 space-y-2.5">
              {rows.map((item) => (
                <li key={item.name} className="flex items-center gap-3">
                  <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-accent-soft text-[14px] font-extrabold text-accent-ink">
                    {item.qty}
                  </span>
                  <span className="text-[20px] font-extrabold leading-tight text-accent-ink">{item.name}</span>
                </li>
              ))}
            </ul>

            <div className="-mx-6 my-5 border-t-2 border-dashed border-line" />

            {spotlight ? (
              <div className="text-[15px] leading-relaxed">
                <p className="font-extrabold">Your reward is on its way.</p>
                <p className="mt-1">
                  It will be added to your Chick-fil-A One account within {SPOTLIGHT_PROMISE_HOURS} hours, and
                  Chick-fil-A will email you when it is there.
                </p>
                <p className="mt-2">
                  To find it, open the Chick-fil-A app and tap Rewards. To use it, add the item to your order.
                  The reward applies on its own.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                {svg && (
                  <div className="shrink-0 rounded-xl bg-white p-2">
                    {/* A data-URI image, not inlined markup: nothing from the generated SVG is ever parsed as page HTML. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
                      alt="Your code"
                      className="size-[120px]"
                    />
                  </div>
                )}
                <p className="text-[14px] leading-snug">
                  <span className="font-extrabold">Show this to a team member.</span>
                  <br />
                  Bring your receipt.
                </p>
              </div>
            )}
          </section>
        ) : recovery.status === "given" ? (
          <section className="mt-8 rounded-3xl bg-card p-6 text-ink">
            <p className="text-[16px] leading-relaxed">
              This was handed over on {formatStoreDate(recovery.given_at)}. Thank you for letting us make it right.
            </p>
          </section>
        ) : (
          <section className="mt-8 rounded-3xl bg-card p-6 text-ink">
            <p className="text-[16px] leading-relaxed">
              This code is no longer active. If you think that is a mistake, reply to our email or call the store.
            </p>
          </section>
        )}

        {owed && !spotlight && (
          <ul className="mt-6 grid grid-cols-3 gap-2.5">
            {STEPS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] border-white px-1.5 py-3 text-center text-[13px] font-bold leading-tight"
              >
                <Icon aria-hidden className="size-5" />
                {label}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-7 text-center text-[15px] font-extrabold">My pleasure to serve you again.</p>
        <p className="mt-1.5 text-center text-[12px] leading-relaxed">
          Good at {STORE_NAME} only.
          {storePhone && (
            <>
              {" "}
              Questions? Call{" "}
              <a href={`tel:${storePhone.replace(/[^\d+]/g, "")}`} className="font-bold underline">
                {storePhone}
              </a>
              .
            </>
          )}
        </p>
      </div>
    </main>
  );
}
