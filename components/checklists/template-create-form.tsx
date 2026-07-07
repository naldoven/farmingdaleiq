"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createTemplate } from "@/app/(app)/checklists/templates/actions";

/** Creates a checklist template, then jumps to its editor page. */
export function TemplateCreateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createTemplate({ name, description });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/checklists/templates/${result.data.id}`);
        });
      }}
    >
      <Input
        aria-label="Template name"
        placeholder="e.g. Opening Kitchen Checklist"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Textarea
        aria-label="Template description"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create template"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
