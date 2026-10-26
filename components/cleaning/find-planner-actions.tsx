"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { NAME_MAX } from "@/app/(app)/cleaning/constants";
import { convertFind, deleteFind } from "@/app/(app)/cleaning/finds-actions";
import {
  ItemDetailsFields,
  emptyItemDetails,
  toItemDetailsInput,
  validateItemDetails,
  type ItemDetailsErrors,
  type ItemDetailsValue,
  type ItemDetailsZone,
} from "@/components/cleaning/item-details-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The two planner-only buttons on an unconverted find: "Add to master list"
 * (docs/CLEANING-PLAN.md "Decisions": ATD log: "A planner can turn a find into
 * a master-list item") and "Delete". Both server actions re-check planning
 * rights; the page only shows these to planners as a convenience.
 *
 * The item form starts with the find's area and its note as the name, so the
 * planner only has to say how often it comes around. The server action is
 * safe to tap twice, and the sheet cannot be dismissed while it runs.
 */
export function FindPlannerActions({
  findId,
  zoneId,
  note,
  zones,
}: {
  findId: string;
  zoneId: string;
  note: string;
  zones: ItemDetailsZone[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ItemDetailsValue>(() => ({
    ...emptyItemDetails(zoneId),
    name: note.slice(0, NAME_MAX),
  }));
  const [errors, setErrors] = useState<ItemDetailsErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    const found = validateItemDetails(value);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setError(null);
    startTransition(async () => {
      const result = await convertFind({ findId, details: toItemDetailsInput(value) });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm("Delete this find? It leaves the log. The photo stays in storage.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteFind({ id: findId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          className="h-11 flex-1 rounded-lg text-[15px]"
          disabled={pending}
          aria-label={`Add to master list: ${note}`}
          onClick={() => setOpen(true)}
        >
          Add to master list
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-lg border-danger/40 px-4 text-[15px] text-danger hover:bg-danger-soft hover:text-danger"
          disabled={pending}
          aria-label={`Delete find: ${note}`}
          onClick={remove}
        >
          Delete
        </Button>
      </div>
      {error && !open ? (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {error}
        </p>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Closing mid-save would hide the answer to an add that may still land.
          if (pending) return;
          setOpen(next);
          if (!next) {
            setError(null);
            setErrors({});
          }
        }}
      >
        <DialogContent className="bottom-0 top-auto max-h-[92dvh] max-w-none translate-y-0 gap-4 overflow-y-auto rounded-b-none px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-5 sm:bottom-auto sm:top-1/2 sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="text-[19px]">Add to the master list</DialogTitle>
            <DialogDescription className="text-[14px]">
              It goes on the list as an approved item, with this photo as its reference.
            </DialogDescription>
          </DialogHeader>
          <ItemDetailsFields value={value} onChange={setValue} zones={zones} errors={errors} disabled={pending} />
          {error ? (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button className="h-12 rounded-lg text-[16px]" disabled={pending} onClick={add}>
              {pending ? "Adding..." : "Add to master list"}
            </Button>
            <Button variant="outline" className="h-12 rounded-lg text-[16px]" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
