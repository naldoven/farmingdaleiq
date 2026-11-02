"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";

import { logRecovery } from "@/app/(app)/guest-recovery/actions";
import { MAX_ITEMS, MAX_QTY } from "@/app/(app)/guest-recovery/constants";
import type { MenuItemView } from "@/app/(app)/guest-recovery/types";
import { logRecoverySchema, normalizeUsPhone } from "@/app/(app)/guest-recovery/validation";
import { SectionCard } from "@/components/mobile";
import { formatItems } from "@/lib/guest-recovery/messages";
import { cn } from "@/lib/utils";

const FIELD =
  "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-ink placeholder:text-muted-ink";
const LABEL = "mb-1 block text-sm font-semibold text-ink";

interface OtherItem {
  key: string;
  name: string;
  qty: number;
}

function Stepper({
  qty,
  label,
  onChange,
}: {
  qty: number;
  label: string;
  onChange: (qty: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Fewer ${label}`}
        onClick={() => onChange(qty - 1)}
        className="flex size-11 items-center justify-center rounded-lg border border-border text-ink"
      >
        <Minus className="size-4" />
      </button>
      <span className="w-6 text-center text-base font-bold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button
        type="button"
        aria-label={`More ${label}`}
        disabled={qty >= MAX_QTY}
        onClick={() => onChange(qty + 1)}
        className="flex size-11 items-center justify-center rounded-lg border border-border text-ink disabled:opacity-40"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
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
  // One id per attempt at saving this form's data. A retry of the same data
  // (dropped connection) reuses it, so the server returns the first recovery
  // instead of making a second. Editing after an attempt starts a new one, so
  // the correction is saved rather than swallowed by the earlier recovery.
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const attempted = useRef(false);

  const [step, setStep] = useState<"edit" | "review">("edit");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [note, setNote] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [picked, setPicked] = useState<Record<string, number>>({});
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
  const pickedCount = Object.keys(picked).length + others.length;

  const selectedItems = [
    ...menu.filter((m) => picked[m.id]).map((m) => ({ name: m.name, qty: picked[m.id] })),
    ...others.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), qty: o.qty })),
  ];

  function setQty(id: string, qty: number) {
    setPicked((current) => {
      const next = { ...current };
      if (qty <= 0) delete next[id];
      else next[id] = Math.min(qty, MAX_QTY);
      return next;
    });
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
      items: [
        ...Object.entries(picked).map(([menuItemId, qty]) => ({ menuItemId, qty })),
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
    attempted.current = true;
    startTransition(async () => {
      try {
        const result = await logRecovery(buildInput());
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.replace(`/guest-recovery/${result.data.id}?notice=${encodeURIComponent(result.data.message)}`);
      } catch {
        // The save may have gone through even though the answer never came
        // back. Same id on the retry, so it cannot be logged or sent twice.
        setError("Could not reach the server. Check the Recoveries list, then tap Confirm again. It will not send twice.");
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
            {orderNumber.trim() && (
              <div>
                <dt className="text-[13px] text-muted-ink">Order number</dt>
                <dd>{orderNumber.trim()}</dd>
              </div>
            )}
            <div>
              <dt className="text-[13px] text-muted-ink">They will be sent</dt>
              <dd>
                {email ? <p>Email to {email}</p> : null}
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
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (attempted.current) {
                  attempted.current = false;
                  setSubmissionId(crypto.randomUUID());
                }
                setStep("edit");
              }}
              className="min-h-11 flex-1 rounded-lg border border-border px-4 text-base font-semibold text-ink disabled:opacity-50"
            >
              Back
            </button>
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
              Order number (optional)
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
              placeholder="Missing from order, late night, and so on"
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
          {categories.map((category) => {
            const rows = visible.filter((m) => m.category === category);
            if (rows.length === 0) return null;
            const hasPicked = rows.some((m) => picked[m.id]);
            return (
              <details key={category} open={Boolean(query) || hasPicked} className="rounded-lg border border-line">
                <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 text-[15px] font-semibold">
                  <span>{category}</span>
                  {hasPicked && <span className="text-[13px] text-accent-ink">Picked</span>}
                </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {rows.map((item) => {
                    const qty = picked[item.id] ?? 0;
                    return (
                      <li key={item.id} className={cn("flex items-center justify-between gap-2 px-3 py-1", qty > 0 && "bg-accent-soft")}>
                        <span className="text-[15px]">{item.name}</span>
                        {qty > 0 ? (
                          <Stepper qty={qty} label={item.name} onChange={(n) => setQty(item.id, n)} />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setQty(item.id, 1)}
                            aria-label={`Add ${item.name}`}
                            className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-ink"
                          >
                            Add
                          </button>
                        )}
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
