"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ActionResult } from "@/app/(app)/cleaning/action-types";
import { addCoordinator, removeCoordinator } from "@/app/(app)/cleaning/settings-actions";
import type { CoordinatorOption, CoordinatorRow } from "@/app/(app)/cleaning/settings-view";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { Button } from "@/components/ui/button";

/**
 * Who holds the coordinator tag. Everyone with planning rights can see the
 * list; only a role-level planner (Location Manager, Director) sees the add
 * and remove controls, because a coordinator must not hand the tag on. The
 * server actions and RLS enforce the same split, so hiding the controls here
 * is only a courtesy.
 */
export function SettingsCoordinators({
  coordinators,
  options,
  canManage,
}: {
  coordinators: CoordinatorRow[];
  options: CoordinatorOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState<"add" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(kind: "add" | "remove", action: () => Promise<ActionResult>, after?: () => void) {
    setError(null);
    setBusy(kind);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  return (
    <SectionCard title="Cleaning coordinators">
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-muted-ink">
          Coordinators plan the week and approve new items. They keep their normal role.
          Location Managers and Directors can always plan.
        </p>

        {coordinators.length === 0 ? (
          <p className="rounded-xl bg-secondary px-4 py-3 text-[14px] text-muted-ink">No coordinators yet.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {coordinators.map((person) => (
              <li key={person.userId} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="break-words text-[15px] font-semibold text-ink">{person.name}</span>
                    <span className="text-[13px] text-muted-ink">{person.roleName}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {person.active ? null : <StatusBadge tone="warning">Inactive</StatusBadge>}
                    {canManage && removing !== person.userId ? (
                      <Button
                        variant="outline"
                        className="h-11 rounded-lg px-4 text-[14px]"
                        disabled={pending}
                        aria-label={`Remove ${person.name}`}
                        onClick={() => {
                          setError(null);
                          setRemoving(person.userId);
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
                {canManage && removing === person.userId ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[14px] font-medium text-ink">
                      Remove {person.name} as a coordinator? They can no longer plan the week.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="h-11 flex-1 rounded-lg text-[15px]"
                        disabled={pending}
                        onClick={() =>
                          run("remove", () => removeCoordinator({ userId: person.userId }), () => setRemoving(null))
                        }
                      >
                        {busy === "remove" ? "Removing..." : "Yes, remove"}
                      </Button>
                      <Button
                        variant="outline"
                        className="h-11 flex-1 rounded-lg text-[15px]"
                        disabled={pending}
                        onClick={() => setRemoving(null)}
                      >
                        Keep
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          options.length === 0 ? (
            <p className="text-[14px] text-muted-ink">Every active leader and trainer is already a coordinator.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="coordinator-picker" className="text-[13px] font-semibold text-ink">
                Add a coordinator
              </label>
              <div className="flex gap-2">
                <select
                  id="coordinator-picker"
                  value={selected}
                  disabled={pending}
                  onChange={(event) => setSelected(event.target.value)}
                  // 16px so iOS Safari does not zoom the page on focus.
                  className="h-12 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-base text-ink disabled:opacity-50"
                >
                  <option value="">Pick a leader or trainer</option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.roleName})
                    </option>
                  ))}
                </select>
                <Button
                  className="h-12 rounded-lg px-5 text-[15px]"
                  disabled={pending || selected === ""}
                  onClick={() => run("add", () => addCoordinator({ userId: selected }), () => setSelected(""))}
                >
                  {busy === "add" ? "Adding..." : "Add"}
                </Button>
              </div>
            </div>
          )
        ) : (
          <p className="text-[13px] text-muted-ink">
            Only a Location Manager or Director can add or remove coordinators.
          </p>
        )}

        {error ? (
          <p role="alert" className="text-[14px] font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
