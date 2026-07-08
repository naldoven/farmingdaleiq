"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard, StatusBadge } from "@/components/mobile";
import { completeRun, saveAnswers, startRun } from "@/app/(app)/checklists/actions";
import {
  evaluateAnswer,
  getHoldingMode,
  getMultiChoiceOptions,
  getTemperatureRange,
  validateSubmission,
  type AnswerInput,
  type FoodItemRangeLike,
  type QuestionLike,
} from "@/app/(app)/checklists/logic";

export interface RunQuestion extends QuestionLike {
  prompt: string;
  correctiveActions: string | null;
}

export interface RunSection {
  id: string;
  name: string;
  questions: RunQuestion[];
}

export interface RunFoodItem extends FoodItemRangeLike {
  id: string;
}

function toAnswerMap(initial: AnswerInput[]): Map<string, AnswerInput> {
  return new Map(initial.map((a) => [a.questionId, a]));
}

/**
 * Mobile-first checklist run player. Local state mirrors `checklist_answers`
 * per question; "Save progress" autosaves without completing, "Complete
 * checklist" re-validates client-side (mirrored server-side in completeRun)
 * and, once clean, saves + completes in one submit.
 */
export function RunPlayerForm({
  runId,
  status,
  sections,
  foodItems,
  initialAnswers,
}: {
  runId: string;
  status: string;
  sections: RunSection[];
  foodItems: RunFoodItem[];
  initialAnswers: AnswerInput[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Map<string, AnswerInput>>(() => toAnswerMap(initialAnswers));
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [banner, setBanner] = useState<{ kind: "error" | "success"; message: string } | null>(null);

  const readOnly = status === "completed";
  const foodItemsById = useMemo(() => new Map(foodItems.map((f) => [f.id, f])), [foodItems]);
  const allQuestions = useMemo(() => sections.flatMap((s) => s.questions), [sections]);

  useEffect(() => {
    if (status === "pending") {
      void startRun({ runId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  function updateAnswer(questionId: string, patch: Partial<AnswerInput>) {
    setAnswers((prev) => {
      const next = new Map(prev);
      const existing = next.get(questionId) ?? {
        questionId,
        value: null,
        isNa: false,
        manuallyFlagged: false,
      };
      next.set(questionId, { ...existing, ...patch });
      return next;
    });
  }

  function toPayload() {
    return allQuestions.map((q) => {
      const a = answers.get(q.id) ?? { questionId: q.id, value: null, isNa: false, manuallyFlagged: false };
      return {
        questionId: q.id,
        value: a.value ?? null,
        isNa: a.isNa,
        manuallyFlagged: a.manuallyFlagged,
        correctiveActionNote: a.correctiveActionNote ?? "",
        comment: a.comment ?? "",
        photoUrl: a.photoUrl ?? "",
      };
    });
  }

  function handleSave() {
    setBanner(null);
    startTransition(async () => {
      const result = await saveAnswers({ runId, answers: toPayload() });
      if (!result.ok) {
        setBanner({ kind: "error", message: result.error });
        return;
      }
      setBanner({ kind: "success", message: "Progress saved." });
      router.refresh();
    });
  }

  function handleComplete() {
    setBanner(null);
    const validationErrors = validateSubmission(allQuestions, answers, foodItemsById);
    if (validationErrors.length > 0) {
      setErrors(new Map(validationErrors.map((e) => [e.questionId, e.message])));
      setBanner({
        kind: "error",
        message: `${validationErrors.length} question${validationErrors.length === 1 ? "" : "s"} need attention before you can finish.`,
      });
      return;
    }
    setErrors(new Map());
    startTransition(async () => {
      const saveResult = await saveAnswers({ runId, answers: toPayload() });
      if (!saveResult.ok) {
        setBanner({ kind: "error", message: saveResult.error });
        return;
      }
      const completeResult = await completeRun({ runId });
      if (!completeResult.ok) {
        setBanner({ kind: "error", message: completeResult.error });
        return;
      }
      setBanner({ kind: "success", message: "Checklist completed." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {readOnly && <StatusBadge tone="success">Completed</StatusBadge>}
      {banner && (
        <p className={banner.kind === "error" ? "text-[13px] text-danger" : "text-[13px] text-success"}>
          {banner.message}
        </p>
      )}

      {sections.map((section) => (
        <SectionCard key={section.id} title={section.name}>
          <div className="flex flex-col gap-4">
            {section.questions.map((question) => {
              const answer = answers.get(question.id) ?? {
                questionId: question.id,
                value: null,
                isNa: false,
                manuallyFlagged: false,
              };
              const foodItem = question.food_item_id ? foodItemsById.get(question.food_item_id) : undefined;
              const evaluated = evaluateAnswer(question, foodItem, answer);
              const errorMessage = errors.get(question.id);

              return (
                <div
                  key={question.id}
                  className={
                    "flex flex-col gap-2 rounded-lg border p-3 " +
                    (errorMessage
                      ? "border-danger bg-danger-soft/40"
                      : evaluated.flagged
                        ? "border-warning bg-warning-soft/40"
                        : "border-line")
                  }
                >
                  <p className="text-[15px] font-semibold text-ink">{question.prompt}</p>

                  {question.type === "yes_no" && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={answer.value === true ? "default" : "outline"}
                        size="sm"
                        disabled={readOnly}
                        onClick={() => updateAnswer(question.id, { value: true, isNa: false })}
                      >
                        Yes
                      </Button>
                      <Button
                        type="button"
                        variant={answer.value === false ? "destructive" : "outline"}
                        size="sm"
                        disabled={readOnly}
                        onClick={() => updateAnswer(question.id, { value: false, isNa: false })}
                      >
                        No
                      </Button>
                    </div>
                  )}

                  {(question.type === "number" || question.type === "temperature") && (
                    <div className="flex flex-col gap-1">
                      <Input
                        type="number"
                        disabled={readOnly}
                        value={typeof answer.value === "number" ? answer.value : ""}
                        onChange={(e) =>
                          updateAnswer(question.id, {
                            value: e.target.value === "" ? null : Number(e.target.value),
                            isNa: false,
                          })
                        }
                        className="max-w-[8rem]"
                      />
                      {question.type === "temperature" &&
                        (() => {
                          const mode = getHoldingMode(question);
                          const range = getTemperatureRange(foodItem, mode);
                          return (
                            <p className="text-xs text-muted-ink">
                              {mode === "hot" ? "Hot holding" : "Cold holding"} range: {range.min ?? "—"}&deg;F
                              to {range.max ?? "—"}&deg;F
                            </p>
                          );
                        })()}
                    </div>
                  )}

                  {question.type === "text" && (
                    <Textarea
                      disabled={readOnly}
                      value={typeof answer.value === "string" ? answer.value : ""}
                      onChange={(e) => updateAnswer(question.id, { value: e.target.value, isNa: false })}
                    />
                  )}

                  {question.type === "multi_choice" && (
                    <select
                      aria-label={question.prompt}
                      disabled={readOnly}
                      value={typeof answer.value === "string" ? answer.value : ""}
                      onChange={(e) => updateAnswer(question.id, { value: e.target.value, isNa: false })}
                      className="h-10 max-w-xs rounded-lg border border-line bg-card px-3 text-sm shadow-sm"
                    >
                      <option value="">Select...</option>
                      {getMultiChoiceOptions(question).map((choice) => (
                        <option key={choice} value={choice}>
                          {choice}
                        </option>
                      ))}
                    </select>
                  )}

                  {evaluated.requiresCorrectiveAction && (
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs text-danger">
                        Out of range — corrective action required
                      </Label>
                      <Textarea
                        disabled={readOnly}
                        value={answer.correctiveActionNote ?? ""}
                        onChange={(e) =>
                          updateAnswer(question.id, { correctiveActionNote: e.target.value })
                        }
                        placeholder={question.correctiveActions || "What did you do about it?"}
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-ink">
                    {question.allow_na && (
                      <Label className="flex items-center gap-1">
                        <Checkbox
                          disabled={readOnly}
                          checked={answer.isNa}
                          onCheckedChange={(v) => updateAnswer(question.id, { isNa: v === true, value: null })}
                        />
                        N/A
                      </Label>
                    )}
                    <Label className="flex items-center gap-1">
                      <Checkbox
                        disabled={readOnly}
                        checked={answer.manuallyFlagged}
                        onCheckedChange={(v) => updateAnswer(question.id, { manuallyFlagged: v === true })}
                      />
                      Flag for follow-up
                    </Label>
                    {question.photo_required && <span>Photo required</span>}
                  </div>

                  {question.photo_required && (
                    <Input
                      aria-label="Photo URL"
                      placeholder="Photo URL"
                      disabled={readOnly}
                      value={answer.photoUrl ?? ""}
                      onChange={(e) => updateAnswer(question.id, { photoUrl: e.target.value })}
                    />
                  )}

                  {errorMessage && <p className="text-xs text-danger">{errorMessage}</p>}
                </div>
              );
            })}
          </div>
        </SectionCard>
      ))}

      {!readOnly && (
        <div className="sticky bottom-0 flex gap-2 border-t border-line bg-canvas/95 p-3 backdrop-blur">
          <Button type="button" variant="outline" disabled={isPending} onClick={handleSave}>
            {isPending ? "Saving..." : "Save progress"}
          </Button>
          <Button type="button" disabled={isPending} onClick={handleComplete}>
            {isPending ? "Working..." : "Complete checklist"}
          </Button>
        </div>
      )}
    </div>
  );
}
