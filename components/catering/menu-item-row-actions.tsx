"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { deleteMenuItem, toggleMenuItemActive } from "@/app/(app)/catering/actions";
import { MenuItemForm, type MenuItemFormData } from "@/components/catering/menu-item-form";

export function MenuItemRowActions({ item }: { item: MenuItemFormData & { id: string; active: boolean } }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return <MenuItemForm initial={item} onSaved={() => setEditing(false)} />;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              await toggleMenuItemActive({ id: item.id, active: !item.active });
              router.refresh();
            });
          }}
        >
          {item.active ? "Deactivate" : "Activate"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => {
            if (!window.confirm(`Delete "${item.name}"?`)) return;
            setError(null);
            startTransition(async () => {
              const result = await deleteMenuItem({ id: item.id });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.refresh();
            });
          }}
        >
          Delete
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
