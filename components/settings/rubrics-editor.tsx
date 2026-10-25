"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/mobile";
import { upsertRubric } from "@/app/(app)/ratings/actions";
import { safeAction } from "@/lib/errors/safe-action";

export interface RubricPositionRow {
  id: string;
  name: string;
  groupName: string | null;
  categories: [string, string, string, string];
}

function hasRubric(categories: readonly string[]): boolean {
  return categories.some((c) => c.trim().length > 0);
}

function RubricRow({ position }: { position: RubricPositionRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState<[string, string, string, string]>(position.categories);

  function save(next: [string, string, string, string]) {
    setError(null);
    startTransition(async () => {
      const result = await safeAction(() =>
        upsertRubric({
          positionId: position.id,
          category1: next[0],
          category2: next[1],
          category3: next[2],
          category4: next[3],
        }),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCategories(next);
      setEditing(false);
      router.refresh();
    });
  }

  const rubricOn = hasRubric(position.categories);

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink">{position.name}</p>
          <p className="truncate text-[13px] text-muted-ink">
            {rubricOn
              ? position.categories.filter((c) => c.trim()).join(" · ")
              : position.groupName ?? "Quick rate only"}
          </p>
        </div>
        <StatusBadge tone={rubricOn ? "success" : "neutral"}>{rubricOn ? "Full rubric" : "Quick rate"}</StatusBadge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 rounded-full"
          disabled={isPending}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Close" : "Edit"}
        </Button>
      </div>

      {editing && (
        <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3">
          {categories.map((value, index) => (
            <div key={index} className="flex flex-col gap-1">
              <Label htmlFor={`rubric-${position.id}-${index}`}>Category {index + 1}</Label>
              <Input
                id={`rubric-${position.id}-${index}`}
                value={value}
                maxLength={100}
                placeholder={index === 0 ? "e.g. Speed" : "Leave blank if unused"}
                onChange={(e) =>
                  setCategories((prev) => {
                    const next = [...prev] as [string, string, string, string];
                    next[index] = e.target.value;
                    return next;
                  })
                }
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-full"
              disabled={isPending || !hasRubric(categories)}
              onClick={() => save(categories)}
            >
              {isPending ? "Saving..." : "Save rubric"}
            </Button>
            {rubricOn && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                disabled={isPending}
                onClick={() => {
                  // Blank categories put the station back on quick-rate: the
                  // rate cell checks for any non-empty category, not for a row.
                  const blank: [string, string, string, string] = ["", "", "", ""];
                  setCategories(blank);
                  save(blank);
                }}
              >
                Back to quick rate
              </Button>
            )}
          </div>
          <p className="text-[13px] text-muted-ink">
            With a rubric, leaders score each category 0 to 5 and the station rating is the average.
            Without one, they give a single quick rating.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Rating rubric editor (docs/STORE-SETUP.md, area "rating_rubrics";
 * ARCHITECTURE.md open question 5). One row per rateable position: either
 * "Quick rate" or the category names of its full rubric. Writes go through
 * the existing upsertRubric action (training.manage), which this is the
 * first screen to call.
 */
export function RubricsEditor({ positions }: { positions: RubricPositionRow[] }) {
  if (positions.length === 0) {
    return <p className="px-4 py-3 text-[13px] text-muted-ink">No rateable positions yet. Add them under Positions.</p>;
  }
  return (
    <div className="divide-y divide-line">
      {positions.map((position) => (
        <RubricRow key={position.id} position={position} />
      ))}
    </div>
  );
}
