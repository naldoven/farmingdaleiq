"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { updateItem } from "@/app/(app)/cleaning/actions";
import {
  ItemDetailsFields,
  toItemDetailsInput,
  validateItemDetails,
  type ItemDetailsErrors,
  type ItemDetailsValue,
  type ItemDetailsZone,
} from "@/components/cleaning/item-details-fields";
import { ItemActions } from "@/components/cleaning/item-actions";
import { SectionCard } from "@/components/mobile";
import { Button } from "@/components/ui/button";

function sameValue(a: ItemDetailsValue, b: ItemDetailsValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Planner view of one item: the shared details form with Save, and the
 * status buttons underneath. Approve stays off while there are unsaved edits,
 * otherwise a planner who fixes a name and taps Approve would approve the old
 * one without noticing.
 */
export function ItemEditor({
  id,
  status,
  initial,
  zones,
}: {
  id: string;
  status: "draft" | "active" | "retired";
  initial: ItemDetailsValue;
  zones: ItemDetailsZone[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  // Messages appear after the first Save tap, then follow the form live so a
  // fixed field stops showing its old complaint.
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const errors: ItemDetailsErrors = attempted ? validateItemDetails(value) : {};
  const dirty = !sameValue(value, saved);
  const retired = status === "retired";

  function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    setServerError(null);
    setJustSaved(false);
    if (Object.keys(validateItemDetails(value)).length > 0) return;

    const snapshot = value;
    startTransition(async () => {
      const result = await updateItem({ id, details: toItemDetailsInput(snapshot) });
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setSaved(snapshot);
      setJustSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Edit details">
        <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
          <ItemDetailsFields
            value={value}
            zones={zones}
            errors={errors}
            disabled={pending}
            onChange={(next) => {
              setValue(next);
              setJustSaved(false);
            }}
          />
          {serverError ? (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {serverError}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" className="h-12 flex-1 rounded-lg text-[16px]" disabled={pending || !dirty}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
            {justSaved && !dirty ? (
              <span role="status" className="text-[14px] font-semibold text-success">
                Saved
              </span>
            ) : null}
          </div>
        </form>
      </SectionCard>

      {retired ? (
        <p className="text-center text-[14px] text-muted-ink">
          This item is retired. It stays here for its history.
        </p>
      ) : (
        <SectionCard title={status === "draft" ? "Review" : "Status"}>
          <ItemActions
            id={id}
            status={status}
            approveBlockedReason={dirty ? "Save your changes first." : undefined}
            afterDeleteHref="/cleaning/items"
          />
        </SectionCard>
      )}
    </div>
  );
}
