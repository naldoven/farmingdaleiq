import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{section.name}</CardTitle>
        <DeleteButton
          id={section.id}
          extra={{ templateId }}
          action={deleteSection}
          label="Delete section"
          confirmMessage={`Delete section "${section.name}" and all its questions?`}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {questions.map((question) => (
          <div
            key={question.id}
            className="flex items-start justify-between gap-2 rounded-md border border-border p-2"
          >
            <div>
              <p className="text-sm font-medium">{question.prompt}</p>
              <p className="text-xs text-muted-foreground">
                {questionSubtitle(question, question.foodItemId ? foodItemNameById.get(question.foodItemId) : undefined)}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {question.allowNa && <Badge variant="outline">N/A allowed</Badge>}
                {question.photoRequired && <Badge variant="outline">Photo required</Badge>}
                {question.tokenValue > 0 && <Badge variant="outline">{question.tokenValue} tokens</Badge>}
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
          <p className="text-sm text-muted-foreground">No questions in this section yet.</p>
        )}
        <QuestionCreateForm
          templateId={templateId}
          sectionId={section.id}
          nextSort={questions.length}
          foodItems={foodItems}
        />
      </CardContent>
    </Card>
  );
}
