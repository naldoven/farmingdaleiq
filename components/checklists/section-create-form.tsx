"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSection } from "@/app/(app)/checklists/templates/actions";

export function SectionCreateForm({ templateId, nextSort }: { templateId: string; nextSort: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex items-end gap-2 border-t border-border pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createSection({ templateId, name, sort: nextSort });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setName("");
          router.refresh();
        });
      }}
    >
      <Input
        aria-label="New section name"
        placeholder="New section name (e.g. Cold Holding)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Button type="submit" variant="secondary" disabled={isPending}>
        {isPending ? "Adding..." : "Add section"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
