"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/mobile";
import { createMenuItem, updateMenuItem } from "@/app/(app)/catering/actions";

export interface MenuItemFormData {
  id?: string;
  name: string;
  category: string;
  componentsText: string;
  scalingRulesText: string;
  active: boolean;
}

/**
 * Create/edit form for a catering menu catalog item. `components` and
 * `scaling_rules` are edited as raw JSON arrays (see app/(app)/catering/
 * logic.ts header for the documented shape) -- a plain textarea is a
 * deliberately simple v1 editor; this data changes rarely (catalog admin,
 * not day-to-day ordering).
 */
export function MenuItemForm({
  initial,
  onSaved,
}: {
  initial?: MenuItemFormData;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [componentsText, setComponentsText] = useState(initial?.componentsText ?? "[]");
  const [scalingRulesText, setScalingRulesText] = useState(initial?.scalingRulesText ?? "[]");
  const [active, setActive] = useState(initial?.active ?? true);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = initial?.id
        ? await updateMenuItem({
            id: initial.id,
            name,
            category,
            componentsText,
            scalingRulesText,
            active,
          })
        : await createMenuItem({ name, category, componentsText, scalingRulesText, active });

      if (result.ok) {
        if (!initial?.id) {
          setName("");
          setCategory("");
          setComponentsText("[]");
          setScalingRulesText("[]");
        }
        router.refresh();
        onSaved?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <SectionCard title={initial?.id ? "Edit menu item" : "New menu item"}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="mi-name">Name</Label>
            <Input id="mi-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mi-category">Category</Label>
            <Input id="mi-category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mi-components">
            Components (JSON array, e.g. [&quot;Sandwich&quot;, {`{"name":"Chips","qty":1}`}])
          </Label>
          <Textarea
            id="mi-components"
            value={componentsText}
            onChange={(e) => setComponentsText(e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="mi-scaling">
            Scaling rules (JSON array, e.g. [{`{"label":"Napkins","perHeadcount":1}`}])
          </Label>
          <Textarea
            id="mi-scaling"
            value={scalingRulesText}
            onChange={(e) => setScalingRulesText(e.target.value)}
            rows={2}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="mi-active" checked={active} onCheckedChange={(v) => setActive(v === true)} />
          <Label htmlFor="mi-active">Active</Label>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" disabled={isPending || !name.trim()} onClick={submit} className="self-start">
          {isPending ? "Saving..." : initial?.id ? "Save changes" : "Add menu item"}
        </Button>
      </div>
    </SectionCard>
  );
}
