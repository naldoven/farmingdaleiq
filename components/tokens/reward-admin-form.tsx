"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createReward, updateReward } from "@/app/(app)/rewards/actions";

export interface RewardAdminFormValues {
  id?: string;
  name: string;
  description: string;
  imageUrl: string;
  tokenCost: string;
  stock: string;
  active: boolean;
}

const EMPTY_FORM: RewardAdminFormValues = {
  name: "",
  description: "",
  imageUrl: "",
  tokenCost: "",
  stock: "",
  active: true,
};

/**
 * Create/edit form for rewards (rewards.manage). Reused for both "add a new
 * reward" (no `initial`) and inline editing an existing one.
 */
export function RewardAdminForm({
  initial,
  onSaved,
}: {
  initial?: RewardAdminFormValues;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<RewardAdminFormValues>(initial ?? EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(initial?.id);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const payload = {
            name: values.name,
            description: values.description,
            imageUrl: values.imageUrl,
            tokenCost: Number(values.tokenCost),
            stock: values.stock,
            active: values.active,
          };

          const result = isEdit && initial?.id
            ? await updateReward({ ...payload, id: initial.id })
            : await createReward(payload);

          if (!result.ok) {
            setError(result.error);
            return;
          }

          if (!isEdit) setValues(EMPTY_FORM);
          router.refresh();
          onSaved?.();
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-name">Name</Label>
        <Input
          id="reward-name"
          required
          value={values.name}
          onChange={(event) => setValues((v) => ({ ...v, name: event.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reward-description">Description</Label>
        <Textarea
          id="reward-description"
          rows={2}
          value={values.description}
          onChange={(event) => setValues((v) => ({ ...v, description: event.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reward-cost">Token cost</Label>
          <Input
            id="reward-cost"
            type="number"
            min="1"
            step="1"
            required
            value={values.tokenCost}
            onChange={(event) => setValues((v) => ({ ...v, tokenCost: event.target.value }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reward-stock">Stock (blank = unlimited)</Label>
          <Input
            id="reward-stock"
            type="number"
            min="0"
            step="1"
            value={values.stock}
            onChange={(event) => setValues((v) => ({ ...v, stock: event.target.value }))}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="reward-active"
          checked={values.active}
          onCheckedChange={(checked) => setValues((v) => ({ ...v, active: checked === true }))}
        />
        <Label htmlFor="reward-active">Active (visible in the store)</Label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : isEdit ? "Save changes" : "Add reward"}
      </Button>
    </form>
  );
}
