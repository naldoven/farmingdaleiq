"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveRecoverySettings } from "@/app/(app)/guest-recovery/settings-actions";
import { MAX_EXPIRY_DAYS, MIN_EXPIRY_DAYS } from "@/app/(app)/guest-recovery/constants";
import { SectionCard } from "@/components/mobile";

export type PersonOption = { id: string; name: string };

const FIELD =
  "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-ink placeholder:text-muted-ink";
const LABEL = "mb-1 block text-sm font-semibold text-ink";

/**
 * Recovery settings form. The server action re-checks the permission and the
 * people picked, so this only shapes the input and shows the result.
 */
export function SettingsForm({
  people,
  expiryDays,
  overseerId,
  backupId,
  storePhone,
}: {
  people: PersonOption[];
  expiryDays: number;
  overseerId: string | null;
  backupId: string | null;
  storePhone: string | null;
}) {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState(String(expiryDays));
  const [overseer, setOverseer] = useState(overseerId ?? "");
  const [backup, setBackup] = useState(backupId ?? "");
  const [phone, setPhone] = useState(storePhone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveRecoverySettings({
        expiryDays: Number(days),
        overseerId: overseer || null,
        backupId: backup || null,
        storePhone: phone,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const options = people.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ));

  return (
    <SectionCard title="Settings">
      <form onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor={`${formId}-days`} className={LABEL}>
            How many days a guest&apos;s code is good for
          </label>
          <input
            id={`${formId}-days`}
            type="number"
            inputMode="numeric"
            className={FIELD}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            min={MIN_EXPIRY_DAYS}
            max={MAX_EXPIRY_DAYS}
            step={1}
            required
          />
          <p className="mt-1 text-sm text-muted-ink">
            {MIN_EXPIRY_DAYS} to {MAX_EXPIRY_DAYS} days. Applies to new recoveries only.
          </p>
        </div>
        <div>
          <label htmlFor={`${formId}-overseer`} className={LABEL}>
            Overseer (sends Spotlight rewards)
          </label>
          <select
            id={`${formId}-overseer`}
            className={FIELD}
            value={overseer}
            onChange={(e) => setOverseer(e.target.value)}
          >
            <option value="">None</option>
            {options}
          </select>
        </div>
        <div>
          <label htmlFor={`${formId}-backup`} className={LABEL}>
            Backup (gets them while the overseer is off)
          </label>
          <select
            id={`${formId}-backup`}
            className={FIELD}
            value={backup}
            onChange={(e) => setBackup(e.target.value)}
          >
            <option value="">None</option>
            {options}
          </select>
        </div>
        <div>
          <label htmlFor={`${formId}-phone`} className={LABEL}>
            Store phone number for app guests
          </label>
          <input
            id={`${formId}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className={FIELD}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(631) 555-0100"
            maxLength={30}
          />
          <p className="mt-1 text-sm text-muted-ink">
            Shown in the email and text to guests who have the Chick-fil-A app, as the number to
            call. Leave blank to say &quot;reply to this email&quot; instead.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {saved && !error && (
          <p role="status" className="text-sm font-medium text-ink">
            Saved.
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 w-full rounded-lg bg-accent px-4 text-base font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </form>
    </SectionCard>
  );
}
