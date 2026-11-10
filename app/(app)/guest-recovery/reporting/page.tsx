import { notFound } from "next/navigation";

import { buildGuestRecoveryReport, type ReportRow } from "@/app/(app)/guest-recovery/stats";
import { ReportingView } from "@/components/guest-recovery/reporting-view";
import { GuestRecoveryTabs } from "@/components/guest-recovery/section-tabs";
import { hasPermission } from "@/lib/auth/permissions";
import { hasMods } from "@/lib/guest-recovery/mods";
import { createClient } from "@/lib/supabase/server";
import { storeDateTimeInputToIso, storeLocalDate } from "@/lib/time";

/**
 * /guest-recovery/reporting (ARCHITECTURE.md "Guest Recovery"). Leaders with
 * guest_recovery.manage only. Aggregate numbers: guest names, emails and
 * phones are never selected here.
 */
export const metadata = { title: "Guest recovery stats" };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const CHUNK = 100;
// One store: a thousand recoveries is years of data. The cap just keeps the
// fetch under Supabase's silent 1000 row limit.
const ROW_CAP = 1000;

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GuestRecoveryReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  if (!(await hasPermission("guest_recovery.manage"))) notFound();

  const now = new Date();
  const currentMonth = storeLocalDate(now).slice(0, 7);
  const asked = first((await searchParams).month);
  const month = asked && MONTH_RE.test(asked) && asked <= currentMonth ? asked : currentMonth;

  // Six months of bars ending at the chosen month, plus a day of slack for the
  // store/UTC offset. Everything newer is kept so "owed over a week" is right.
  const since = new Date(`${shiftMonth(month, -5)}-01T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 1);

  const supabase = await createClient();
  // First instant of the chosen month and of the next, in store time (DST-safe).
  const fromIso = storeDateTimeInputToIso(`${month}-01T00:00`);
  const toIso = storeDateTimeInputToIso(`${shiftMonth(month, 1)}-01T00:00`);
  const [recoveriesRes, oldOwedRes, dayPartsRes, repeatRes] = await Promise.all([
    supabase
      .from("guest_recoveries")
      .select("id, status, created_at, given_at, logged_by, reason")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(ROW_CAP),
    // Anything still owed from before the window counts toward the follow-up warning.
    supabase
      .from("guest_recoveries")
      .select("id, status, created_at, given_at, logged_by, reason")
      .eq("status", "owed")
      .lt("created_at", since.toISOString())
      .limit(ROW_CAP),
    supabase.from("day_parts").select("name, start_time, end_time, sort").order("sort"),
    fromIso && toIso
      ? supabase.rpc("guest_recovery_repeat_summary", { p_from: fromIso, p_to: toIso })
      : Promise.resolve(null),
  ]);
  if (recoveriesRes.error || oldOwedRes.error || dayPartsRes.error) {
    throw new Error("Could not load guest recovery stats");
  }

  const recoveries = [...(recoveriesRes.data ?? []), ...(oldOwedRes.data ?? [])];
  const ids = recoveries.map((r) => r.id);
  const loggerIds = [...new Set(recoveries.map((r) => r.logged_by))];

  const itemsByRecovery = new Map<string, ReportRow["items"]>();
  const sendsByRecovery = new Map<string, { first: string | null; email: boolean; sms: boolean }>();
  const names = new Map<string, string>();

  await Promise.all([
    ...chunks(ids).map(async (part) => {
      const { data, error } = await supabase
        .from("guest_recovery_items")
        .select("recovery_id, family, qty, removed, added, mod_note, fault_source")
        .in("recovery_id", part);
      if (error) throw new Error("Could not load guest recovery items");
      for (const item of data ?? []) {
        const list = itemsByRecovery.get(item.recovery_id) ?? [];
        list.push({
          family: item.family,
          qty: item.qty,
          modded: hasMods({ removed: item.removed, added: item.added, note: item.mod_note }),
          faultSource: item.fault_source,
        });
        itemsByRecovery.set(item.recovery_id, list);
      }
    }),
    ...chunks(ids).map(async (part) => {
      const { data, error } = await supabase
        .from("guest_recovery_sends")
        .select("recovery_id, channel, sent_at")
        .eq("status", "sent")
        .in("recovery_id", part);
      if (error) throw new Error("Could not load guest recovery sends");
      for (const send of data ?? []) {
        const entry = sendsByRecovery.get(send.recovery_id) ?? { first: null, email: false, sms: false };
        if (send.sent_at && (entry.first === null || send.sent_at < entry.first)) entry.first = send.sent_at;
        if (send.channel === "email") entry.email = true;
        if (send.channel === "sms") entry.sms = true;
        sendsByRecovery.set(send.recovery_id, entry);
      }
    }),
    ...chunks(loggerIds).map(async (part) => {
      const { data } = await supabase.from("profiles").select("id, name").in("id", part);
      for (const p of data ?? []) names.set(p.id, p.name);
    }),
  ]);

  const rows: ReportRow[] = recoveries.map((r) => {
    const sends = sendsByRecovery.get(r.id);
    return {
      id: r.id,
      status: r.status as ReportRow["status"],
      createdAt: r.created_at,
      givenAt: r.given_at,
      loggedBy: r.logged_by,
      loggedByName: names.get(r.logged_by) ?? "Former team member",
      reason: r.reason ?? null,
      items: itemsByRecovery.get(r.id) ?? [],
      firstSendAt: sends?.first ?? null,
      emailSent: sends?.email ?? false,
      smsSent: sends?.sms ?? false,
    };
  });

  // A failed summary only hides the repeat line; it never fails the page.
  const repeatRow = repeatRes && !repeatRes.error ? repeatRes.data?.[0] : undefined;
  const repeat = repeatRow
    ? { recoveries: repeatRow.repeat_recoveries, guests: repeatRow.repeat_guests }
    : null;

  const report = buildGuestRecoveryReport(rows, { month, now, dayParts: dayPartsRes.data ?? [], repeat });

  return (
    <div className="space-y-4">
      <GuestRecoveryTabs group="recoveries" />
      <ReportingView
        report={report}
        prevHref={`/guest-recovery/reporting?month=${shiftMonth(month, -1)}`}
        nextHref={month < currentMonth ? `/guest-recovery/reporting?month=${shiftMonth(month, 1)}` : null}
      />
    </div>
  );
}
