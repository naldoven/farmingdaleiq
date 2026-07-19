"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/mobile";
import { quickRate, rubricRate } from "@/app/(app)/ratings/actions";
import { colorForRating, ratingCellTitle, type RatingColor } from "@/app/(app)/ratings/logic";

const COLOR_CLASSES: Record<RatingColor, string> = {
  above: "border-info text-info",
  below: "border-danger text-danger",
  even: "border-line text-ink",
  none: "border-dashed border-line text-muted-ink",
};

export interface RubricCategories {
  category_1: string | null;
  category_2: string | null;
  category_3: string | null;
  category_4: string | null;
}

export function RateCell({
  userId,
  positionId,
  personName,
  positionName,
  stars,
  comment: priorComment,
  storeAverage,
  rubric,
  canRate,
}: {
  userId: string;
  positionId: string;
  personName: string;
  positionName: string;
  stars: number | null;
  /** RAT4: the comment saved with the current rating, if any. */
  comment?: string | null;
  storeAverage: number | null;
  rubric: RubricCategories | null;
  canRate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // RAT4: preload the prior comment so re-rating shows the note to read/edit,
  // matching how quickStars preloads the prior stars.
  const [comment, setComment] = useState(priorComment ?? "");
  const [quickStars, setQuickStars] = useState(stars ?? 0);
  const [cat, setCat] = useState({ c1: 3, c2: 3, c3: 3, c4: 3 });

  const color = colorForRating(stars, storeAverage);
  const hasRubric = rubric !== null && (rubric.category_1 || rubric.category_2 || rubric.category_3 || rubric.category_4);

  const label = stars === null ? "—" : stars.toFixed(1);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        disabled={!canRate}
        onClick={() => setOpen(true)}
        className={`relative flex h-9 w-14 items-center justify-center rounded-md border text-sm font-medium transition-colors ${COLOR_CLASSES[color]} ${canRate ? "hover:bg-muted" : "cursor-default opacity-80"}`}
        title={ratingCellTitle(personName, positionName, priorComment)}
      >
        {label}
        {priorComment?.trim() && (
          // RAT4: a dot marks that a comment is attached; the text is in the
          // tooltip (title) above.
          <span
            aria-label="Has a comment"
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-info"
          />
        )}
      </button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Rate {personName} — {positionName}
          </DialogTitle>
        </DialogHeader>

        {hasRubric && rubric ? (
          <div className="flex flex-col gap-3">
            {([
              ["c1", rubric.category_1],
              ["c2", rubric.category_2],
              ["c3", rubric.category_3],
              ["c4", rubric.category_4],
            ] as const)
              .filter(([, name]) => Boolean(name))
              .map(([key, name]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`cat-${key}`}>{name}</Label>
                  <Input
                    id={`cat-${key}`}
                    type="number"
                    min={0}
                    max={5}
                    step={0.5}
                    value={cat[key]}
                    onChange={(e) => setCat((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                  />
                </div>
              ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quick-stars">Stars (0-5)</Label>
            <Input
              id="quick-stars"
              type="number"
              min={0}
              max={5}
              step={0.5}
              value={quickStars}
              onChange={(e) => setQuickStars(Number(e.target.value))}
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-comment">Comment</Label>
          <Input id="rate-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>

        {stars !== null && stars < 3 && <StatusBadge tone="warning">Below qualified (3.0)</StatusBadge>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = hasRubric
                  ? await rubricRate({
                      userId,
                      positionId,
                      category1: rubric?.category_1 ? cat.c1 : null,
                      category2: rubric?.category_2 ? cat.c2 : null,
                      category3: rubric?.category_3 ? cat.c3 : null,
                      category4: rubric?.category_4 ? cat.c4 : null,
                      comment,
                    })
                  : await quickRate({ userId, positionId, stars: quickStars, comment });

                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              });
            }}
          >
            {isPending ? "Saving..." : "Save rating"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
