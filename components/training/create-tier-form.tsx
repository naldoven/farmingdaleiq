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
import { createTier } from "@/app/(app)/people/org-chart/actions";

export function CreateTierForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [department, setDepartment] = useState<"foh" | "kitchen" | "store">("foh");
  const [name, setName] = useState("");
  const [goalCount, setGoalCount] = useState("1");

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createTier({ department, name, goalCount: Number(goalCount) || 0, sort: 0 });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setName("");
          setGoalCount("1");
          router.refresh();
        });
      }}
    >
      <Select value={department} onValueChange={(v) => setDepartment(v as typeof department)}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="foh">FOH</SelectItem>
          <SelectItem value="kitchen">Kitchen</SelectItem>
          <SelectItem value="store">Store</SelectItem>
        </SelectContent>
      </Select>
      <Input placeholder="Tier name" value={name} onChange={(e) => setName(e.target.value)} className="w-48" />
      <Input
        type="number"
        min={0}
        placeholder="Goal count"
        value={goalCount}
        onChange={(e) => setGoalCount(e.target.value)}
        className="w-28"
      />
      <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
        Add tier
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}
