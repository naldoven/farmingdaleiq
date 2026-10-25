"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { approveItem, deleteDraftItem, retireItem } from "@/app/(app)/cleaning/actions";
import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Confirming = "delete" | "retire" | null;

/**
 * Planner buttons for one master-list item: Approve and Delete on a draft,
 * Retire on an active item. The server actions re-check planning rights and
 * are safe to repeat (approve filters on status, delete only removes drafts),
 * so a double tap here is harmless; the disabled state is for feedback.
 *
 * Delete and Retire ask once, inline, instead of window.confirm: a phone
 * dialog is easy to dismiss by accident and invisible to tests.
 */
export function ItemActions({
  id,
  status,
  approveBlockedReason,
  afterDeleteHref,
  className,
}: {
  id: string;
  status: "draft" | "active" | "retired";
  /** When set, Approve is disabled and this explains why (for example unsaved edits). */
  approveBlockedReason?: string;
  /** Where to go once a draft is deleted; without it the current page just refreshes. */
  afterDeleteHref?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);

  function run(action: () => Promise<ActionResult>, afterHref?: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming(null);
      if (afterHref) router.push(afterHref);
      else router.refresh();
    });
  }

  if (status === "retired") return null;

  const prompt =
    confirming === "delete"
      ? "Delete this draft? This can't be undone."
      : confirming === "retire"
        ? "Retire this item? It leaves future weeks. Its history stays."
        : null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {confirming ? (
        <>
          <p className="text-[14px] font-medium text-ink">{prompt}</p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="h-11 flex-1 rounded-lg text-[15px]"
              disabled={pending}
              onClick={() =>
                confirming === "delete"
                  ? run(() => deleteDraftItem({ id }), afterDeleteHref)
                  : run(() => retireItem({ id }))
              }
            >
              {pending ? "Working..." : confirming === "delete" ? "Yes, delete" : "Yes, retire"}
            </Button>
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-lg text-[15px]"
              disabled={pending}
              onClick={() => {
                setConfirming(null);
                setError(null);
              }}
            >
              Keep it
            </Button>
          </div>
        </>
      ) : status === "draft" ? (
        <div className="flex gap-2">
          <Button
            className="h-11 flex-1 rounded-lg text-[15px]"
            disabled={pending || Boolean(approveBlockedReason)}
            onClick={() => run(() => approveItem({ id }))}
          >
            {pending ? "Approving..." : "Approve"}
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1 rounded-lg border-danger/40 text-[15px] text-danger hover:bg-danger-soft hover:text-danger"
            disabled={pending}
            onClick={() => setConfirming("delete")}
          >
            Delete
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="h-11 w-full rounded-lg border-danger/40 text-[15px] text-danger hover:bg-danger-soft hover:text-danger"
          disabled={pending}
          onClick={() => setConfirming("retire")}
        >
          Retire
        </Button>
      )}
      {approveBlockedReason && status === "draft" && !confirming ? (
        <p className="text-[13px] text-muted-ink">{approveBlockedReason}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
