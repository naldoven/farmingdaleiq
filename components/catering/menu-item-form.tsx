"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/mobile";
import { createMenuItem, updateMenuItem } from "@/app/(app)/catering/actions";
import {
  componentsTextToRows,
  emptyComponentRow,
  emptyScalingRuleRow,
  findComponentProblem,
  findScalingRuleProblem,
  rowsToComponentsText,
  rowsToScalingRulesText,
  scalingRulesTextToRows,
  type ComponentRow,
  type ScalingRuleRow,
} from "@/app/(app)/catering/menu/rows";

export interface MenuItemFormData {
  id?: string;
  name: string;
  category: string;
  pickupPriceText: string;
  deliveryPriceText: string;
  componentsText: string;
  scalingRulesText: string;
  active: boolean;
}

/**
 * Create/edit form for a catering menu catalog item. `components` and
 * `scaling_rules` are edited as rows (one line per component, one line per
 * scaling rule) and serialized to the JSON text the server action accepts
 * (app/(app)/catering/menu/rows.ts). The saved shape is unchanged. The rows
 * are checked here for a fast message and again on the server, which refuses
 * bad input instead of repairing it. The old form took raw JSON in a textarea,
 * which a manager could not fill in from a phone (docs/STORE-SETUP.md, area
 * "catering_menu").
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
  const [pickupPriceText, setPickupPriceText] = useState(initial?.pickupPriceText ?? "");
  const [deliveryPriceText, setDeliveryPriceText] = useState(initial?.deliveryPriceText ?? "");
  const [components, setComponents] = useState<ComponentRow[]>(() =>
    componentsTextToRows(initial?.componentsText ?? "[]"),
  );
  const [scalingRules, setScalingRules] = useState<ScalingRuleRow[]>(() =>
    scalingRulesTextToRows(initial?.scalingRulesText ?? "[]"),
  );
  const [active, setActive] = useState(initial?.active ?? true);

  // CAT2: the always-present "New menu item" form and an open "Edit" form
  // render on the same page, so hardcoded field ids (mi-name, ...) collided,
  // producing invalid HTML and breaking label-to-input association (clicking
  // one form's label focused the other's input). Scope every id/htmlFor to the
  // item so each field id is unique across both forms.
  const scope = initial?.id ?? "new";

  function updateComponent(index: number, patch: Partial<ComponentRow>) {
    setComponents((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateRule(index: number, patch: Partial<ScalingRuleRow>) {
    setScalingRules((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function submit() {
    setError(null);
    const problem = findComponentProblem(components) ?? findScalingRuleProblem(scalingRules);
    if (problem) {
      setError(problem);
      return;
    }
    const componentsText = rowsToComponentsText(components);
    const scalingRulesText = rowsToScalingRulesText(scalingRules);

    startTransition(async () => {
      const result = initial?.id
        ? await updateMenuItem({
            id: initial.id,
            name,
            category,
            pickupPriceText,
            deliveryPriceText,
            componentsText,
            scalingRulesText,
            active,
          })
        : await createMenuItem({ name, category, pickupPriceText, deliveryPriceText, componentsText, scalingRulesText, active });

      if (result.ok) {
        if (!initial?.id) {
          setName("");
          setCategory("");
          setPickupPriceText("");
          setDeliveryPriceText("");
          setComponents([]);
          setScalingRules([]);
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
            <Label htmlFor={`mi-name-${scope}`}>Name</Label>
            <Input id={`mi-name-${scope}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`mi-category-${scope}`}>Category</Label>
            <Input id={`mi-category-${scope}`} value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            {/* Prices are set once, on a new item. On edit they are read-only text
                (updateMenuItem refuses a changed price). */}
            <Label htmlFor={initial?.id ? undefined : `mi-pickup-price-${scope}`}>Pickup price</Label>
            {initial?.id ? (
              <p className="text-sm">{pickupPriceText ? `$${pickupPriceText}` : "Not listed"}</p>
            ) : (
              <Input
                id={`mi-pickup-price-${scope}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={pickupPriceText}
                onChange={(e) => setPickupPriceText(e.target.value)}
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={initial?.id ? undefined : `mi-delivery-price-${scope}`}>Delivery price</Label>
            {initial?.id ? (
              <p className="text-sm">{deliveryPriceText ? `$${deliveryPriceText}` : "Not listed"}</p>
            ) : (
              <Input
                id={`mi-delivery-price-${scope}`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={deliveryPriceText}
                onChange={(e) => setDeliveryPriceText(e.target.value)}
              />
            )}
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold text-ink">Components</legend>
          <p className="text-[13px] text-muted-ink">
            What the kitchen preps for one of this item. Example: a boxed meal is 1 sandwich, 1 chips, 1
            cookie.
          </p>
          {components.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                aria-label={`Component ${index + 1} name`}
                placeholder="Component"
                value={row.name}
                onChange={(e) => updateComponent(index, { name: e.target.value })}
                className="min-w-0 flex-1"
              />
              <Input
                aria-label={`Component ${index + 1} quantity`}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={row.qtyText}
                onChange={(e) => updateComponent(index, { qtyText: e.target.value })}
                className="w-16 shrink-0 text-center"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                aria-label={`Remove component ${index + 1}`}
                onClick={() => setComponents((rows) => rows.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start rounded-full"
            onClick={() => setComponents((rows) => [...rows, emptyComponentRow()])}
          >
            Add component
          </Button>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold text-ink">Scaling rules</legend>
          <p className="text-[13px] text-muted-ink">
            Supplies the FOH setup list adds for this item. Per guest multiplies by the order headcount.
            Per item multiplies by how many of this item are ordered. Example: sauce packets, 2 per
            guest; napkins, 1 per item.
          </p>
          {scalingRules.length > 0 && (
            <div className="grid grid-cols-[1fr_4rem_4rem_2rem] gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-ink">
              <span>Supply</span>
              <span className="text-center">Per guest</span>
              <span className="text-center">Per item</span>
              <span />
            </div>
          )}
          {scalingRules.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_4rem_4rem_2rem] items-center gap-2">
              <Input
                aria-label={`Scaling rule ${index + 1} supply`}
                placeholder="Supply (e.g. Sauce packets)"
                value={row.label}
                onChange={(e) => updateRule(index, { label: e.target.value })}
                className="min-w-0"
              />
              <Input
                aria-label={`Scaling rule ${index + 1} per guest`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={row.perHeadcountText}
                onChange={(e) => updateRule(index, { perHeadcountText: e.target.value })}
                className="text-center"
              />
              <Input
                aria-label={`Scaling rule ${index + 1} per item`}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={row.perQtyText}
                onChange={(e) => updateRule(index, { perQtyText: e.target.value })}
                className="text-center"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label={`Remove scaling rule ${index + 1}`}
                onClick={() => setScalingRules((rows) => rows.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start rounded-full"
            onClick={() => setScalingRules((rows) => [...rows, emptyScalingRuleRow()])}
          >
            Add scaling rule
          </Button>
        </fieldset>

        <div className="flex items-center gap-2">
          <Checkbox id={`mi-active-${scope}`} checked={active} onCheckedChange={(v) => setActive(v === true)} />
          <Label htmlFor={`mi-active-${scope}`}>Active</Label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="button" disabled={isPending || !name.trim()} onClick={submit} className="self-start">
          {isPending ? "Saving..." : initial?.id ? "Save changes" : "Add menu item"}
        </Button>
      </div>
    </SectionCard>
  );
}
