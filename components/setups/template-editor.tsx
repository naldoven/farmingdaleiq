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
import {
  addTemplatePosition,
  createSetupTemplate,
  deleteSetupTemplate,
  removeTemplatePosition,
  reorderTemplatePosition,
} from "@/app/(app)/setups/templates/actions";

export interface DayPartRow {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

export interface PositionRow {
  id: string;
  group_id: string | null;
  name: string;
  sort: number;
}

export interface SetupTemplateRow {
  id: string;
  name: string;
  day_part_id: string | null;
}

export interface TemplatePositionRow {
  template_id: string;
  position_id: string;
  sort: number;
}

const NONE = "none";

export function TemplateEditor({
  dayParts,
  positions,
  templates,
  templatePositions,
}: {
  dayParts: DayPartRow[];
  positions: PositionRow[];
  templates: SetupTemplateRow[];
  templatePositions: TemplatePositionRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dayPartId, setDayPartId] = useState<string>(NONE);
  const [addPositionByTemplate, setAddPositionByTemplate] = useState<Record<string, string>>({});

  const dayPartName = new Map(dayParts.map((d) => [d.id, d.name]));
  const positionName = new Map(positions.map((p) => [p.id, p.name]));

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await createSetupTemplate({
              name,
              dayPartId: dayPartId === NONE ? null : dayPartId,
            });
            if (result.ok) {
              setName("");
              setDayPartId(NONE);
            }
            return result;
          });
        }}
      >
        <Input
          aria-label="New template name"
          placeholder="New template name (e.g. Lunch rush)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Select value={dayPartId} onValueChange={setDayPartId}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Day part" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No day part</SelectItem>
            {dayParts.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={isPending}>
          Create template
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-4">
        {templates.map((template) => {
          const ordered = templatePositions
            .filter((tp) => tp.template_id === template.id)
            .sort((a, b) => a.sort - b.sort);
          const usedIds = new Set(ordered.map((tp) => tp.position_id));
          const available = positions.filter((p) => !usedIds.has(p.id));
          const selectedToAdd = addPositionByTemplate[template.id] ?? "";

          return (
            <div key={template.id} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{template.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {template.day_part_id ? dayPartName.get(template.day_part_id) : "No day part"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => run(() => deleteSetupTemplate({ id: template.id }))}
                >
                  Delete
                </Button>
              </div>

              <ol className="mb-3 flex flex-col gap-1">
                {ordered.map((tp, index) => (
                  <li key={tp.position_id} className="flex items-center justify-between text-sm">
                    <span>
                      {index + 1}. {positionName.get(tp.position_id) ?? "Unknown position"}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending || index === 0}
                        onClick={() =>
                          run(() =>
                            reorderTemplatePosition({
                              templateId: template.id,
                              positionId: tp.position_id,
                              direction: "up",
                            }),
                          )
                        }
                      >
                        Up
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending || index === ordered.length - 1}
                        onClick={() =>
                          run(() =>
                            reorderTemplatePosition({
                              templateId: template.id,
                              positionId: tp.position_id,
                              direction: "down",
                            }),
                          )
                        }
                      >
                        Down
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          run(() =>
                            removeTemplatePosition({
                              templateId: template.id,
                              positionId: tp.position_id,
                            }),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </span>
                  </li>
                ))}
                {ordered.length === 0 && (
                  <li className="text-sm text-muted-foreground">No positions on this template yet.</li>
                )}
              </ol>

              {available.length > 0 && (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!selectedToAdd) return;
                    run(async () => {
                      const result = await addTemplatePosition({
                        templateId: template.id,
                        positionId: selectedToAdd,
                      });
                      if (result.ok) {
                        setAddPositionByTemplate((prev) => ({ ...prev, [template.id]: "" }));
                      }
                      return result;
                    });
                  }}
                >
                  <Select
                    value={selectedToAdd}
                    onValueChange={(value) =>
                      setAddPositionByTemplate((prev) => ({ ...prev, [template.id]: value }))
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Add a position" />
                    </SelectTrigger>
                    <SelectContent>
                      {available.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="submit" size="sm" variant="outline" disabled={isPending}>
                    Add
                  </Button>
                </form>
              )}
            </div>
          );
        })}
        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground">No templates yet.</p>
        )}
      </div>
    </div>
  );
}
