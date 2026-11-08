"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setDirectorsRole } from "@/app/(app)/catering/drivers/actions";
import { Button } from "@/components/ui/button";

/**
 * Saves the Discord role ID that escalations tag. The page only renders this
 * for people with settings.manage; setDirectorsRole re-checks that key on the
 * server. Blank clears it, and escalations then post without a tag.
 */
export function DirectorsRoleForm({ current }: { current: string | null }) {
  const router = useRouter();
  const inputId = useId();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(current ?? "");
  // The saved value as this form knows it, so Save goes quiet the moment a
  // save lands rather than when the page refresh does.
  const [stored, setStored] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const trimmed = value.trim();
  const dirty = trimmed !== stored;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setDirectorsRole({ roleId: trimmed === "" ? null : trimmed });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setStored(trimmed);
          setValue(trimmed);
          setSaved(true);
          router.refresh();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-[13px] font-semibold text-ink">
          Directors role ID
        </label>
        <input
          id={inputId}
          value={value}
          inputMode="numeric"
          autoComplete="off"
          disabled={isPending}
          onChange={(event) => {
            setValue(event.target.value);
            setSaved(false);
            setError(null);
          }}
          placeholder="Paste the role ID"
          className="h-11 w-full rounded-lg border border-line bg-card px-3 text-[16px] text-ink disabled:opacity-50"
        />
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
