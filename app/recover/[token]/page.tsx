import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { STORE_NAME, TOKEN_PATTERN } from "@/app/(app)/guest-recovery/constants";
import { loadRecoveryIdByToken } from "@/app/(app)/guest-recovery/queries";
import { hasPermission } from "@/lib/auth/permissions";
import { firstNameOf, formatItems, recoveryLink } from "@/lib/guest-recovery/messages";
import { resolveBaseUrl } from "@/lib/guest-recovery/base-url";
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

/**
 * The page a guest opens from their email or text (ARCHITECTURE.md "Guest
 * Recovery"). Public, and the only thing that unlocks it is the 64-character
 * token in the address. It shows the guest's first name, what they are owed
 * and a QR of this same address, and nothing else: no email, phone, order
 * number, other guests or staff names. A signed-in leader who opens it (by
 * scanning the guest's QR) goes to the redeem screen instead.
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
    .select("id, guest_name, status, created_at, given_at")
    .eq("token", token)
    .maybeSingle();
  if (!recovery) notFound();

  const { data: items } = await service
    .from("guest_recovery_items")
    .select("name, qty")
    .eq("recovery_id", recovery.id)
    .order("name");

  const baseUrl = await resolveBaseUrl();
  const svg = baseUrl ? await qrSvg(recoveryLink(baseUrl, token)) : null;

  const owed = recovery.status === "owed";

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-4 bg-canvas p-4 pt-8">
      <p className="text-[12px] font-bold uppercase tracking-widest text-accent">{STORE_NAME}</p>
      <h1 className="text-[26px] font-bold leading-tight text-ink">
        Hi {firstNameOf(recovery.guest_name)}, we&apos;re sorry about your order.
      </h1>

      {owed ? (
        <>
          <section className="rounded-xl bg-card p-4 shadow-card">
            <p className="text-[13px] text-muted-ink">We owe you</p>
            <p className="mt-1 text-[20px] font-bold text-accent-ink">
              {formatItems((items ?? []).map((i) => ({ name: i.name, qty: i.qty })))}
            </p>
            <p className="mt-3 text-[15px] text-ink">
              Next time you visit, bring your receipt inside or through the drive-thru and show this page to any team
              member.
            </p>
          </section>

          {svg && (
            <section className="rounded-xl bg-card p-4 text-center shadow-card">
              {/* A data-URI image, not inlined markup: nothing from the generated SVG is ever parsed as page HTML. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
                alt="Your code"
                className="mx-auto w-56 max-w-full"
              />
              <p className="mt-2 text-[13px] text-muted-ink">A team member can scan this.</p>
            </section>
          )}

          <p className="rounded-xl bg-warning-soft p-3 text-[14px] text-ink">
            <strong>Redeemable only at {STORE_NAME}.</strong> Receipt required.
          </p>
        </>
      ) : recovery.status === "given" ? (
        <section className="rounded-xl bg-card p-4 shadow-card">
          <p className="text-[16px] text-ink">
            This was handed over on {formatStoreDate(recovery.given_at)}. Thank you for letting us make it right.
          </p>
        </section>
      ) : (
        <section className="rounded-xl bg-card p-4 shadow-card">
          <p className="text-[16px] text-ink">This code is no longer active. If you think that is a mistake, reply to our email or call the store.</p>
        </section>
      )}
    </main>
  );
}
