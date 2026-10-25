"use client";

import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import { cadenceLabel } from "@/app/(app)/cleaning/logic";
import { ChipRow, FilterChip } from "@/components/mobile";
import { ItemDetailsFields } from "@/components/cleaning/item-details-fields";
import { MarkupCanvas } from "@/components/cleaning/markup-canvas";
import { hasErrors, validateShotForm, type ShotForm, type ShotFormErrors } from "@/components/cleaning/walkthrough-form";

export interface WalkthroughZone {
  id: string;
  name: string;
  color: string;
  side: string;
}

export interface WalkthroughItem {
  id: string;
  zone_id: string;
  name: string;
  kind: string;
  days_of_week: number[] | null;
  half: string;
  interval_weeks: number | null;
}

/**
 * Everything about one photo, filled in on the spot (Naldo, 2026-10-25:
 * "Everything on the spot"). Sits above the camera layer and the app's tab
 * bar (z-[70] over the camera's z-[60]); the Quote Tool found sheets placed
 * under the tab bar lose their bottom buttons.
 */
export function WalkthroughDetailsSheet({
  previewUrl,
  aspect,
  initial,
  zones,
  items,
  serverError,
  onSave,
  onLater,
  onDiscard,
}: {
  previewUrl: string;
  aspect: number;
  initial: ShotForm;
  zones: WalkthroughZone[];
  items: WalkthroughItem[];
  serverError: string | null;
  onSave: (form: ShotForm) => void;
  onLater: (form: ShotForm) => void;
  onDiscard: () => void;
}) {
  const [form, setForm] = useState<ShotForm>(initial);
  const [errors, setErrors] = useState<ShotFormErrors>({});
  const [query, setQuery] = useState("");
  const [allZones, setAllZones] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((item) => allZones || item.zone_id === form.details.zoneId)
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [items, allZones, form.details.zoneId, query]);

  const zoneName = (id: string) => zones.find((z) => z.id === id)?.name ?? "";

  function save() {
    const found = validateShotForm(form);
    setErrors(found);
    if (!hasErrors(found)) onSave(form);
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-canvas">
      <div className="flex items-center justify-between border-b border-line bg-card px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <button type="button" className="h-11 px-2 text-[15px] font-semibold text-ink" onClick={() => onLater(form)}>
          Later
        </button>
        <h2 className="text-[17px] font-bold text-ink">Photo details</h2>
        <button
          type="button"
          className="h-11 px-2 text-[15px] font-semibold text-danger"
          onClick={() => {
            if (window.confirm("Delete this photo? It has not been saved.")) onDiscard();
          }}
        >
          Delete
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-32 pt-4">
        <div className="mx-auto flex max-w-[480px] flex-col gap-4">
          {serverError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[14px] font-medium text-danger" role="alert">
              Not saved: {serverError}
            </p>
          )}

          <MarkupCanvas
            src={previewUrl}
            aspect={aspect}
            value={form.markup}
            onChange={(markup) => setForm({ ...form, markup })}
          />

          <ChipRow aria-label="New or existing item">
            <FilterChip type="button" active={form.mode === "new"} activeColor="accent" onClick={() => setForm({ ...form, mode: "new" })}>
              New item
            </FilterChip>
            <FilterChip
              type="button"
              active={form.mode === "existing"}
              activeColor="accent"
              onClick={() => setForm({ ...form, mode: "existing" })}
            >
              Already on the list
            </FilterChip>
          </ChipRow>

          {form.mode === "new" ? (
            <ItemDetailsFields
              value={form.details}
              onChange={(details) => setForm({ ...form, details })}
              zones={zones}
              errors={errors}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[14px] text-muted-ink">
                Adds this photo to an item already on the master list, like a constant from the paper sheet.
              </p>
              <label className="flex items-center gap-2 rounded-lg border border-line bg-card px-3">
                <Search className="h-4 w-4 text-muted-ink" aria-hidden />
                <span className="sr-only">Search items</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={allZones ? "Search all zones" : `Search ${zoneName(form.details.zoneId)} zone`}
                  className="h-12 flex-1 bg-transparent text-[16px] outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-[14px] text-ink">
                <input type="checkbox" checked={allZones} onChange={(e) => setAllZones(e.target.checked)} className="h-5 w-5" />
                Show every zone
              </label>
              {errors.existingItemId && (
                <p className="text-[13px] font-medium text-danger">{errors.existingItemId}</p>
              )}
              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-xl bg-card shadow-card">
                {matches.length === 0 && <li className="px-4 py-3 text-[14px] text-muted-ink">No items match.</li>}
                {matches.map((item) => {
                  const chosen = form.existingItemId === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left"
                        aria-pressed={chosen}
                        onClick={() => setForm({ ...form, existingItemId: item.id, existingItemName: item.name })}
                      >
                        <span className="flex-1">
                          <span className="block text-[15px] font-semibold text-ink">{item.name}</span>
                          <span className="block text-[13px] text-muted-ink">
                            {allZones ? `${zoneName(item.zone_id)} · ` : ""}
                            {cadenceLabel(item)}
                          </span>
                        </span>
                        {chosen && <Check className="h-5 w-5 text-accent" aria-label="Chosen" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[71] border-t border-line bg-card px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
        <button
          type="button"
          onClick={save}
          className="mx-auto block h-14 w-full max-w-[480px] rounded-lg bg-accent text-[17px] font-bold text-white"
        >
          Save and keep shooting
        </button>
      </div>
    </div>
  );
}
