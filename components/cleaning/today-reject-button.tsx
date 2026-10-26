"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { rejectClean } from "@/app/(app)/cleaning/today-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * Mirrors REJECT_NOTE_MAX in validation.ts and the database check on
 * reject_note. Not imported from there: validation.ts pulls zod into the
 * browser bundle (see constants.ts).
 */
const REJECT_NOTE_LIMIT = 300;

/**
 * Planner-only "Reject" for a finished clean (plan "Checking": the photo is
 * the proof, and a planner can send it back with a note). The note is
 * required; the clean reopens on the next shift's list tagged "redo". The
 * server action re-checks planning rights and is safe to tap twice.
 *
 * A bottom sheet on a phone, a centered dialog on a desktop.
 */
export function RejectCleanButton({ id, itemName }: { id: string; itemName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await rejectClean({ id, note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-save would hide the answer to a reject that may still land.
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          aria-label={`Reject: ${itemName}`}
          className="h-11 w-full rounded-lg border-danger/40 text-[15px] text-danger hover:bg-danger-soft hover:text-danger"
        >
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent className="bottom-0 top-auto max-w-none translate-y-0 gap-4 rounded-b-none px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-5 sm:bottom-auto sm:top-1/2 sm:max-w-lg sm:-translate-y-1/2 sm:rounded-b-xl sm:p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[19px]">Send this clean back</DialogTitle>
          <DialogDescription className="text-[14px]">
            {itemName}. It reopens on the next shift&apos;s list as a redo, and this photo will not count as on time.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`reject-note-${id}`} className="text-[14px] font-semibold text-ink">
            What needs redoing?
          </label>
          <Textarea
            id={`reject-note-${id}`}
            value={note}
            maxLength={REJECT_NOTE_LIMIT}
            rows={3}
            disabled={pending}
            placeholder="For example: still grease behind the fryer"
            className="text-[16px]"
            onChange={(e) => setNote(e.target.value)}
          />
          <p className="text-right text-[12px] text-muted-ink">
            {note.length}/{REJECT_NOTE_LIMIT}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="destructive"
            className="h-12 rounded-lg text-[16px]"
            disabled={pending || note.trim().length === 0}
            onClick={submit}
          >
            {pending ? "Rejecting..." : "Reject and redo"}
          </Button>
          <Button variant="outline" className="h-12 rounded-lg text-[16px]" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
