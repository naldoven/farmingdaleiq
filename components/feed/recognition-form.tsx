"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createRecognition } from "@/app/(app)/team/actions";

export interface RecognitionSubjectOption {
  id: string;
  name: string;
}

/**
 * Leader "send a Recognition" form (ARCHITECTURE.md "Tokens & Rewards":
 * "Leaders send Recognitions: tokens + a public shoutout in the Team
 * Feed"). Only rendered when the page already checked tokens.award.
 */
export function RecognitionForm({ subjects }: { subjects: RecognitionSubjectOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [subjectUserId, setSubjectUserId] = useState(subjects[0]?.id ?? "");
  const [amount, setAmount] = useState("10");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!subjectUserId) {
          setError("Pick who you're recognizing.");
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await createRecognition({
            subjectUserId,
            amount: Number(amount),
            body,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setBody("");
          router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="recognition-subject">
            Who
          </label>
          <Select value={subjectUserId} onValueChange={setSubjectUserId} disabled={subjects.length === 0}>
            <SelectTrigger id="recognition-subject">
              <SelectValue placeholder="Pick a coworker" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="recognition-amount">
            Tokens
          </label>
          <Input
            id="recognition-amount"
            type="number"
            min="1"
            step="1"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="recognition-body">
          What did they do well?
        </label>
        <Textarea
          id="recognition-body"
          required
          rows={2}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending || !subjectUserId}>
        {isPending ? "Posting..." : "Send recognition"}
      </Button>
    </form>
  );
}
