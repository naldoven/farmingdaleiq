"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateTemplate } from "@/app/(app)/checklists/templates/actions";

/** Toggles a template's active flag in place (edits to name/description happen via re-creating a template today). */
export function TemplateActiveToggle({
  templateId,
  name,
  description,
  active,
}: {
  templateId: string;
  name: string;
  description: string | null;
  active: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Badge variant={active ? "success" : "outline"}>{active ? "Active" : "Inactive"}</Badge>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await updateTemplate({
              id: templateId,
              name,
              description: description ?? "",
              active: !active,
            });
            if (result.ok) router.refresh();
          });
        }}
      >
        {isPending ? "..." : active ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}
