import { SectionCard, StatusBadge } from "@/components/mobile";
import { DeleteButton } from "@/components/checklists/delete-button";
import { QuestionCreateForm } from "@/components/checklists/question-create-form";
import { getHoldingMode, getMultiChoiceOptions } from "@/app/(app)/checklists/logic";
import { deleteQuestion, deleteSection } from "@/app/(app)/checklists/templates/actions";

export interface QuestionRow {
  id: string;
  type: string;
  prompt: string;
  allowNa: boolean;
  choices: unknown;
  foodItemId: string | null;
  correctiveActions: string | null;
  photoRequired: boolean;
  tokenValue: number;
}

function questionSubtitle(question: QuestionRow, foodItemName?: string): string {
  if (question.type === "temperature") {
    const mode = getHoldingMode(question);
    return `Temperature - ${mode === "hot" ? "hot" : "cold"} holding${foodItemName ? ` - ${foodItemName}` : ""}`;
  }
  if (question.type === "multi_choice") {
    return `Multiple choice - ${getMultiChoiceOptions(question).join(", ")}`;
  }
  return question.type.replace("_", " ");
}

/** One template section: its questions (read-only summary + delete) plus the add-question form. */
export function SectionEditor({
  templateId,
  section,
  questions,
  foodItems,
}: {
  templateId: string;
  section: { id: string; name: string; sort: number };
  questions: QuestionRow[];
  foodItems: { id: string; name: string }[];
}) {
  const foodItemNameById = new Map(foodItems.map((f) => [f.id, f.name]));

  return (
    <SectionCard
      title={section.name}
      action={
        <DeleteButton
          id={section.id}
          extra={{ templateId }}
          action={deleteSection}
          label="Delete section"
          confirmMessage={`Delete section "${section.name}" and all its questions?`}
        />
      }
    >
      <div className="flex flex-col gap-2">
        {questions.map((question) => (
          <div
            key={question.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-line p-3"
          >
            <div>
              <p className="text-[15px] font-semibold text-ink">{question.prompt}</p>
              <p className="text-[13px] text-muted-ink">
                {questionSubtitle(question, question.foodItemId ? foodItemNameById.get(question.foodItemId) : undefined)}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {question.allowNa && <StatusBadge tone="neutral">N/A allowed</StatusBadge>}
                {question.photoRequired && <StatusBadge tone="info">Photo required</StatusBadge>}
                {question.tokenValue > 0 && <StatusBadge tone="warning">{question.tokenValue} tokens</StatusBadge>}
              </div>
            </div>
            <DeleteButton
              id={question.id}
              extra={{ templateId }}
              action={deleteQuestion}
              label="Delete"
            />
          </div>
        ))}
        {questions.length === 0 && (
          <p className="text-[13px] text-muted-ink">No questions in this section yet.</p>
        )}
        <QuestionCreateForm
          templateId={templateId}
          sectionId={section.id}
          nextSort={questions.length}
          foodItems={foodItems}
        />
      </div>
    </SectionCard>
  );
}
