"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setEscalationContact } from "@/app/(app)/catering/drivers/actions";
import type { PersonOption } from "@/app/(app)/catering/drivers/queries";
import { Button } from "@/components/ui/button";

/**
 * Picks who gets driver escalations. The page only renders this for people
 * with settings.manage; setEscalationContact re-checks that key on the server.
 */
export function EscalationContactForm({
  current,
  people,
}: {
  current: PersonOption | null;
  people: PersonOption[];
}) {
  const router = useRouter();
  const selectId = useId();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(current?.id ?? "");
  // The saved choice as this form knows it, so Save goes quiet the moment a
  // save lands rather than when the page refresh does.
  const [stored, setStored] = useState(current?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A contact who has since gone inactive is not in the active list. Keep them
  // as an option so the select shows the truth instead of snapping to Nobody.
  const options = current && !people.some((person) => person.id === current.id) ? [current, ...people] : people;
  const dirty = value !== stored;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setEscalationContact({ profileId: value === "" ? null : value });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setStored(value);
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={selectId} className="text-[13px] font-semibold text-ink">
          Escalation contact
        </label>
        <select
          id={selectId}
          value={value}
          disabled={isPending}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
            setError(null);
          }}
          className="h-11 w-full rounded-lg border border-line bg-card px-3 text-[16px] text-ink disabled:opacity-50"
        >
          <option value="">Nobody</option>
          {options.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || isPending} className="h-11 min-w-24 text-[14px] font-semibold">
          {isPending ? "Saving..." : "Save"}
        </Button>
        {saved && !dirty && (
          <p role="status" className="text-[13px] font-semibold text-success">
            Saved
          </p>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
