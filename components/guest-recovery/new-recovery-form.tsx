"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { logRecovery } from "@/app/(app)/guest-recovery/actions";
import {
  FAULT_LABELS,
  MAX_ITEMS,
  MAX_QTY,
  REASONS,
  REASON_LABELS,
  SPOTLIGHT_PROMISE_HOURS,
  type Reason,
  type RecoveryPath,
} from "@/app/(app)/guest-recovery/constants";
import type { MenuItemView } from "@/app/(app)/guest-recovery/types";
import { logRecoverySchema, normalizeUsPhone } from "@/app/(app)/guest-recovery/validation";
import { faultAsked, newLine, OrderLineCard, Stepper, type OrderLine } from "@/components/guest-recovery/order-line";
import { SectionCard } from "@/components/mobile";
import { formatItems } from "@/lib/guest-recovery/messages";
import { deriveFaultSource } from "@/lib/guest-recovery/mods";
import { cn } from "@/lib/utils";

const FIELD =
  "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-ink placeholder:text-muted-ink";
const LABEL = "mb-1 block text-sm font-semibold text-ink";

interface OtherItem {
  key: string;
  name: string;
  qty: number;
}

/**
 * Log a guest's missing items (ARCHITECTURE.md "Guest Recovery"): who, how to
 * reach them, what was missing. Two steps, edit then review, so the leader
 * sees exactly what the guest will be sent before it goes. The submission id is
 * made once per form, so a double tap or a retry cannot log it twice.
 */
export function NewRecoveryForm({ menu }: { menu: MenuItemView[] }) {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  // One id for the life of this form. A retry (dropped connection, double tap)
  // reuses it, so the server returns the first recovery instead of making a
  // second. If an attempt's outcome is unknown (the answer never came back), the
  // form stops letting the leader edit: the save may have gone through, so the
  // choices are to retry the same data or to check the list.
  const [submissionId] = useState(() => crypto.randomUUID());
  const [unknownOutcome, setUnknownOutcome] = useState(false);

  const [step, setStep] = useState<"edit" | "review">("edit");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [note, setNote] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [path, setPath] = useState<RecoveryPath | null>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  // One line per order item. Two lines of the same menu item stay apart so each keeps its own changes.
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [others, setOthers] = useState<OtherItem[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(menu.map((m) => m.category))], [menu]);
  const query = search.trim().toLowerCase();
  const visible = useMemo(
    () => (query ? menu.filter((m) => `${m.name} ${m.family}`.toLowerCase().includes(query)) : menu),
    [menu, query],
  );

  const phoneOk = guestPhone.trim() !== "" && normalizeUsPhone(guestPhone) !== null;
  const pickedCount = lines.length + others.length;
  const menuById = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);

  const selectedItems = [
    ...lines.flatMap((line) => {
      const item = menuById.get(line.menuItemId);
      return item
        ? [{ name: item.name, qty: line.qty, removed: line.removed, added: line.added, modNote: line.modNote.trim() || null }]
        : [];
    }),
    ...others.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), qty: o.qty })),
  ];

  /**
   * Add taps. An item that takes changes always starts a new line, so a second
   * sandwich can have different changes. A plain item (nuggets, a drink) just
   * counts up, as before.
   */
  function addItem(item: MenuItemView) {
    setLines((current) => {
      if (!item.modifiable) {
        const existing = current.find((l) => l.menuItemId === item.id);
        if (existing) {
          return current.map((l) => (l === existing ? { ...l, qty: Math.min(l.qty + 1, MAX_QTY) } : l));
        }
      }
      return [...current, newLine(item.id)];
    });
  }

  function changeLine(key: string, next: OrderLine | null) {
    setLines((current) => (next ? current.map((l) => (l.key === key ? next : l)) : current.filter((l) => l.key !== key)));
  }

  function buildInput() {
    return {
      submissionId,
      guestName,
      guestEmail,
      guestPhone,
      orderNumber,
      note,
      smsConsent,
      reason: reason ?? undefined,
      path: path ?? undefined,
      items: [
        ...lines.map((line) => {
          // Answers only count when the questions were showing for this line.
          const asked = faultAsked(line, reason);
          return {
            menuItemId: line.menuItemId,
            qty: line.qty,
            removed: line.removed,
            added: line.added,
            modNote: line.modNote,
            receiptOk: asked ? line.receiptOk : null,
            itemOk: asked ? line.itemOk : null,
          };
        }),
        ...others.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), qty: o.qty })),
      ],
    };
  }

  function review(event: React.FormEvent) {
    event.preventDefault();
    const check = logRecoverySchema.safeParse(buildInput());
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setError(null);
    setStep("review");
    window.scrollTo({ top: 0 });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await logRecovery(buildInput() as Parameters<typeof logRecovery>[0]);
        setUnknownOutcome(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.replace(`/guest-recovery/${result.data.id}?notice=${encodeURIComponent(result.data.message)}`);
      } catch {
        // The save may have gone through even though the answer never came
        // back. Same id on the retry, so it cannot be logged or sent twice.
        setUnknownOutcome(true);
        setError("Could not reach the server. Tap Confirm again: it will not send twice. Or check the Recoveries list.");
      }
    });
  }

  if (step === "review") {
    const email = guestEmail.trim().toLowerCase();
    const phone = normalizeUsPhone(guestPhone);
    return (
      <div className="space-y-4">
        <SectionCard title="Check before sending">
          <dl className="space-y-3 text-[15px]">
            <div>
              <dt className="text-[13px] text-muted-ink">Guest</dt>
              <dd className="font-semibold">{guestName.trim()}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-ink">What was missing</dt>
              <dd className="font-semibold text-accent-ink">{formatItems(selectedItems)}</dd>
            </div>
            {lines.some((l) => faultAsked(l, reason) && (l.receiptOk !== null || l.itemOk !== null)) && (
              <div>
                <dt className="text-[13px] text-muted-ink">Likely cause</dt>
                <dd>
                  {lines
                    .filter((l) => faultAsked(l, reason) && (l.receiptOk !== null || l.itemOk !== null))
                    .map((l) => `${menuById.get(l.menuItemId)?.name ?? "Item"}: ${FAULT_LABELS[deriveFaultSource(l.receiptOk, l.itemOk)]}`)
                    .join(". ")}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-[13px] text-muted-ink">Why they called</dt>
              <dd>{reason ? REASON_LABELS[reason] : ""}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-ink">Order number</dt>
              <dd>{orderNumber.trim()}</dd>
            </div>
            {note.trim() && (
              <div>
                <dt className="text-[13px] text-muted-ink">Note</dt>
                <dd>{note.trim()}</dd>
              </div>
            )}
            <div>
              <dt className="text-[13px] text-muted-ink">They will be sent</dt>
              <dd>
                {path === "spotlight" ? (
                  <p className="font-semibold">
                    Chick-fil-A app guest: a message saying their reward comes within {SPOTLIGHT_PROMISE_HOURS} hours.
                    No code. The overseer is told to send it.
                  </p>
                ) : (
                  <p className="font-semibold">A code they bring in with their receipt.</p>
                )}
                <p>Email to {email}</p>
                {phone ? (
                  <p>{smsConsent ? `Text to ${guestPhone.trim()}` : "No text (guest did not agree to one)"}</p>
                ) : null}
              </dd>
            </div>
          </dl>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            {unknownOutcome ? (
              <Link
                href="/guest-recovery"
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border px-4 text-base font-semibold text-ink"
              >
                Check the list
              </Link>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => setStep("edit")}
                className="min-h-11 flex-1 rounded-lg border border-border px-4 text-base font-semibold text-ink disabled:opacity-50"
              >
                Back
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={confirm}
              className="min-h-11 flex-[2] rounded-lg bg-accent px-4 text-base font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Sending..." : "Confirm and send"}
            </button>
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <form onSubmit={review} className="space-y-4" noValidate>
      <SectionCard title="Does the guest have the Chick-fil-A app?">
        <div role="radiogroup" aria-label="Does the guest have the Chick-fil-A app?" className="grid gap-2">
          {(
            [
              ["standard", "No app", "We email and text them a code to bring in with their receipt."],
              [
                "spotlight",
                "Has the Chick-fil-A app",
                `We tell them a reward comes within ${SPOTLIGHT_PROMISE_HOURS} hours. The overseer sends it. No code.`,
              ],
            ] as const
          ).map(([value, title, help]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={path === value}
              onClick={() => setPath(value)}
              className={cn(
                "min-h-14 rounded-xl border px-4 py-3 text-left",
                path === value ? "border-accent bg-accent-soft" : "border-border bg-card",
              )}
            >
              <span className="block text-[16px] font-semibold text-ink">{title}</span>
              <span className="block text-[13px] text-muted-ink">{help}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Why did they call?">
        <div role="radiogroup" aria-label="Why did they call?" className="flex flex-wrap gap-2">
          {REASONS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={reason === value}
              onClick={() => setReason(value)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-[15px] font-semibold",
                reason === value ? "border-accent bg-accent text-white" : "border-border bg-card text-ink",
              )}
            >
              {REASON_LABELS[value]}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Guest">
        <div className="space-y-3">
          <div>
            <label htmlFor={`${formId}-name`} className={LABEL}>
              Name
            </label>
            <input
              id={`${formId}-name`}
              className={FIELD}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={80}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-phone`} className={LABEL}>
              Phone
            </label>
            <input
              id={`${formId}-phone`}
              className={FIELD}
              type="tel"
              inputMode="tel"
              value={guestPhone}
              onChange={(e) => setGuestPhone(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-email`} className={LABEL}>
              Email
            </label>
            <input
              id={`${formId}-email`}
              className={FIELD}
              type="email"
              inputMode="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
            />
          </div>
          {phoneOk && (
            <label className="flex min-h-11 items-start gap-3 rounded-lg bg-canvas p-3 text-[15px]">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0"
                checked={smsConsent}
                onChange={(e) => setSmsConsent(e.target.checked)}
              />
              <span>Guest said it is OK to text them about this order.</span>
            </label>
          )}
          <div>
            <label htmlFor={`${formId}-order`} className={LABEL}>
              Order number
            </label>
            <input
              id={`${formId}-order`}
              className={FIELD}
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              maxLength={40}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-note`} className={LABEL}>
              Note (optional)
            </label>
            <input
              id={`${formId}-note`}
              className={FIELD}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              autoComplete="off"
              placeholder="Anything the next leader should know"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`What was missing${pickedCount > 0 ? ` (${pickedCount})` : ""}`}>
        <div className="space-y-3">
          <input
            className={FIELD}
            type="search"
            aria-label="Search the menu"
            placeholder="Search the menu"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
          {lines.length > 0 && (
            <ul className="space-y-2" aria-label="On the order">
              {lines.map((line) => {
                const item = menuById.get(line.menuItemId);
                if (!item) return null;
                return (
                  <OrderLineCard
                    key={line.key}
                    line={line}
                    item={item}
                    reason={reason}
                    onChange={(next) => changeLine(line.key, next)}
                  />
                );
              })}
            </ul>
          )}
          {categories.map((category) => {
            const rows = visible.filter((m) => m.category === category);
            if (rows.length === 0) return null;
            const hasPicked = rows.some((m) => lines.some((l) => l.menuItemId === m.id));
            return (
              <details key={category} open={Boolean(query) || hasPicked} className="rounded-lg border border-line">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 text-[15px] font-semibold">
                  <span>{category}</span>
                  {hasPicked && <span className="text-[13px] text-accent-ink">Picked</span>}
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {rows.map((item) => {
                    const count = lines.filter((l) => l.menuItemId === item.id).reduce((sum, l) => sum + l.qty, 0);
                    return (
                      <li key={item.id} className={cn("flex items-center justify-between gap-2 px-3 py-1", count > 0 && "bg-accent-soft")}>
                        <span className="text-[15px]">
                          {item.name}
                          {count > 0 && <span className="ml-2 text-[13px] font-bold text-accent-ink">x{count}</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => addItem(item)}
                          disabled={pickedCount >= MAX_ITEMS}
                          aria-label={`Add ${item.name}`}
                          className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-ink disabled:opacity-40"
                        >
                          {count > 0 && item.modifiable ? "Add another" : "Add"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
          {visible.length === 0 && <p className="text-[15px] text-muted-ink">Nothing on the menu matches that.</p>}

          <div className="space-y-2">
            <p className="text-sm font-semibold">Not on the list?</p>
            {others.map((other) => (
              <div key={other.key} className="flex items-center gap-2">
                <input
                  className={FIELD}
                  aria-label="Other item name"
                  value={other.name}
                  maxLength={80}
                  autoComplete="off"
                  onChange={(e) =>
                    setOthers((list) => list.map((o) => (o.key === other.key ? { ...o, name: e.target.value } : o)))
                  }
                />
                <Stepper
                  qty={other.qty}
                  label="of this item"
                  onChange={(n) =>
                    n <= 0
                      ? setOthers((list) => list.filter((o) => o.key !== other.key))
                      : setOthers((list) => list.map((o) => (o.key === other.key ? { ...o, qty: n } : o)))
                  }
                />
              </div>
            ))}
            <button
              type="button"
              disabled={pickedCount >= MAX_ITEMS}
              onClick={() => setOthers((list) => [...list, { key: crypto.randomUUID(), name: "", qty: 1 }])}
              className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-ink disabled:opacity-40"
            >
              Add another item
            </button>
          </div>
        </div>
      </SectionCard>

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <button type="submit" className="min-h-12 w-full rounded-lg bg-accent px-4 text-base font-semibold text-white">
        Review
      </button>
    </form>
  );
}
