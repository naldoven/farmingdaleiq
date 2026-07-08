"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HOLDING_MODES, QUESTION_TYPES, type HoldingMode, type QuestionType } from "@/app/(app)/checklists/logic";
import { createQuestion } from "@/app/(app)/checklists/templates/actions";

const TYPE_LABELS: Record<QuestionType, string> = {
  yes_no: "Yes / No",
  number: "Number",
  temperature: "Temperature",
  text: "Text",
  multi_choice: "Multiple choice",
};

/** Adds a question to a section. Fields shown adapt to the chosen question type. */
export function QuestionCreateForm({
  templateId,
  sectionId,
  nextSort,
  foodItems,
}: {
  templateId: string;
  sectionId: string;
  nextSort: number;
  foodItems: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState<QuestionType>("yes_no");
  const [prompt, setPrompt] = useState("");
  const [allowNa, setAllowNa] = useState(false);
  const [holdingMode, setHoldingMode] = useState<HoldingMode>("cold");
  const [foodItemId, setFoodItemId] = useState("");
  const [choicesText, setChoicesText] = useState("");
  const [correctiveActions, setCorrectiveActions] = useState("");
  const [photoRequired, setPhotoRequired] = useState(false);
  const [tokenValue, setTokenValue] = useState("0");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-dashed border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createQuestion({
            templateId,
            sectionId,
            type,
            prompt,
            allowNa,
            holdingMode,
            foodItemId: type === "temperature" ? foodItemId : "",
            choicesText,
            correctiveActions,
            photoRequired,
            tokenValue: Number(tokenValue) || 0,
            sort: nextSort,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setPrompt("");
          setChoicesText("");
          setCorrectiveActions("");
          setFoodItemId("");
          setPhotoRequired(false);
          setTokenValue("0");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Question type"
          value={type}
          onChange={(e) => setType(e.target.value as QuestionType)}
          className="h-10 rounded-lg border border-line bg-card px-3 text-sm shadow-sm"
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <Input
          aria-label="Question prompt"
          placeholder="Question prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-w-[16rem] flex-1"
          required
        />
        <Input
          aria-label="Token value"
          placeholder="Tokens"
          value={tokenValue}
          onChange={(e) => setTokenValue(e.target.value)}
          className="max-w-[6rem]"
          inputMode="numeric"
        />
      </div>

      {type === "temperature" && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Food item"
            value={foodItemId}
            onChange={(e) => setFoodItemId(e.target.value)}
            className="h-10 rounded-lg border border-line bg-card px-3 text-sm shadow-sm"
            required
          >
            <option value="">Select food item...</option>
            {foodItems.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Holding mode"
            value={holdingMode}
            onChange={(e) => setHoldingMode(e.target.value as HoldingMode)}
            className="h-10 rounded-lg border border-line bg-card px-3 text-sm shadow-sm"
          >
            {HOLDING_MODES.map((m) => (
              <option key={m} value={m}>
                {m === "cold" ? "Cold holding" : "Hot holding"}
              </option>
            ))}
          </select>
        </div>
      )}

      {type === "multi_choice" && (
        <Input
          aria-label="Choices (comma separated)"
          placeholder="Choices, comma separated (e.g. Clean, Dirty, Needs repair)"
          value={choicesText}
          onChange={(e) => setChoicesText(e.target.value)}
        />
      )}

      <Textarea
        aria-label="Corrective actions"
        placeholder="Corrective action guidance shown when this fails (optional)"
        value={correctiveActions}
        onChange={(e) => setCorrectiveActions(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Label className="flex items-center gap-2">
          <Checkbox checked={allowNa} onCheckedChange={(v) => setAllowNa(v === true)} />
          Allow N/A
        </Label>
        <Label className="flex items-center gap-2">
          <Checkbox checked={photoRequired} onCheckedChange={(v) => setPhotoRequired(v === true)} />
          Photo required
        </Label>
      </div>

      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
          {isPending ? "Adding..." : "Add question"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
