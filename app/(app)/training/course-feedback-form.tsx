"use client";

/**
 * Course feedback widget (ARCHITECTURE.md training courses; parity-audit fix
 * for "submitCourseFeedback is never called" -- the action existed with no
 * caller). Any signed-in member can leave 1-5 stars + optional text, per the
 * course_feedback RLS policy (self or manager).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitCourseFeedback } from "@/app/(app)/training/actions";

const STARS = [1, 2, 3, 4, 5];

export function CourseFeedbackForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");

  if (submitted) {
    return <p className="text-xs text-muted-foreground">Thanks for the feedback.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-1">
        {STARS.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`${s} star${s > 1 ? "s" : ""}`}
            className={`text-lg leading-none ${rating !== null && s <= rating ? "text-primary" : "text-muted-foreground"}`}
            onClick={() => setRating(s)}
          >
            ★
          </button>
        ))}
      </div>
      <Textarea
        placeholder="Feedback (optional)"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
        className="max-w-md"
      />
      <Button
        size="sm"
        className="self-start"
        disabled={isPending || rating === null}
        onClick={() =>
          startTransition(async () => {
            if (rating === null) return;
            const result = await submitCourseFeedback({ courseId, rating, feedback });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setSubmitted(true);
            router.refresh();
          })
        }
      >
        Submit feedback
      </Button>
    </div>
  );
}
