"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { addMenuItem, setMenuItemActive, setMenuItemMods } from "@/app/(app)/guest-recovery/menu-actions";
import type { MenuItemView } from "@/app/(app)/guest-recovery/types";
import { ListRow, SectionCard, StatusBadge } from "@/components/mobile";
import { cn } from "@/lib/utils";

const FIELD =
  "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base text-ink placeholder:text-muted-ink";
const LABEL = "mb-1 block text-sm font-semibold text-ink";
const NEW_CATEGORY = "__new__";

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {message}
    </p>
  );
}

/**
 * The recovery menu, grouped by category, with an add form on top. Rows show
 * the saved state; the page refreshes after each change so a failed save never
 * looks like it worked.
 */
export function MenuManager({ items }: { items: MenuItemView[] }) {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [family, setFamily] = useState("");
  const [category, setCategory] = useState("");
  const [typedCategory, setTypedCategory] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const families = useMemo(() => [...new Set(items.map((i) => i.family))].sort(), [items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const grouped = useMemo(
    () => categories.map((c) => ({ category: c, rows: items.filter((i) => i.category === c) })),
    [categories, items],
  );

  const chosenCategory = category === NEW_CATEGORY ? typedCategory : category;

  function add(event: React.FormEvent) {
    event.preventDefault();
    setAddError(null);
    startTransition(async () => {
      const result = await addMenuItem({
        name,
        // An empty group falls back to the item's own name, a group of one.
        family: family.trim() || name,
        category: chosenCategory,
      });
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      setName("");
      setFamily("");
      router.refresh();
    });
  }

  function toggle(item: MenuItemView) {
    setRowError(null);
    setPendingId(item.id);
    startTransition(async () => {
      const result = await setMenuItemActive({ id: item.id, active: !item.active });
      setPendingId(null);
      if (!result.ok) {
        setRowError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <SectionCard title="Add an item">
        <form onSubmit={add} className="space-y-3">
          <div>
            <label htmlFor={`${formId}-name`} className={LABEL}>
              Item name
            </label>
            <input
              id={`${formId}-name`}
              className={FIELD}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label htmlFor={`${formId}-family`} className={LABEL}>
              Group (items in a group are the same kind of food)
            </label>
            <input
              id={`${formId}-family`}
              className={FIELD}
              value={family}
              onChange={(e) => setFamily(e.target.value)}
              list={`${formId}-families`}
              maxLength={80}
              autoComplete="off"
              placeholder="Leave blank to use the item name"
            />
            <datalist id={`${formId}-families`}>
              {families.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor={`${formId}-category`} className={LABEL}>
              Category
            </label>
            <select
              id={`${formId}-category`}
              className={FIELD}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="" disabled>
                Pick a category
              </option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={NEW_CATEGORY}>A new category...</option>
            </select>
          </div>
          {category === NEW_CATEGORY && (
            <div>
              <label htmlFor={`${formId}-newcat`} className={LABEL}>
                New category name
              </label>
              <input
                id={`${formId}-newcat`}
                className={FIELD}
                value={typedCategory}
                onChange={(e) => setTypedCategory(e.target.value)}
                maxLength={40}
                autoComplete="off"
                required
              />
            </div>
          )}
          <ErrorLine message={addError} />
          <button
            type="submit"
            disabled={pending}
            className="min-h-11 w-full rounded-lg bg-accent px-4 text-base font-semibold text-white disabled:opacity-50"
          >
            Add item
          </button>
        </form>
      </SectionCard>

      <ErrorLine message={rowError} />

      {grouped.map(({ category: groupName, rows }) => (
        <SectionCard key={groupName} title={groupName} flush>
          {rows.map((item) => (
            <div key={item.id}>
              <ListRow
                title={<span className={cn(!item.active && "text-muted-ink")}>{item.name}</span>}
                description={
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{item.family}</span>
                    {item.modifiable && <StatusBadge tone="info">Takes changes</StatusBadge>}
                    {!item.active && <StatusBadge tone="neutral">Hidden</StatusBadge>}
                  </span>
                }
                trailing={
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                      aria-expanded={editingId === item.id}
                      aria-label={`Changes for ${item.name}`}
                      className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold text-ink"
                    >
                      Changes
                    </button>
                    <button
                      type="button"
                      disabled={pending && pendingId === item.id}
                      onClick={() => toggle(item)}
                      aria-label={`${item.active ? "Hide" : "Show"} ${item.name}`}
                      className="min-h-11 min-w-16 rounded-lg border border-border px-3 text-sm font-semibold text-ink disabled:opacity-50"
                    >
                      {item.active ? "Hide" : "Show"}
                    </button>
                  </span>
                }
                className={cn(!item.active && "opacity-60")}
              />
              {editingId === item.id && <ModsEditor item={item} onSaved={() => setEditingId(null)} />}
            </div>
          ))}
        </SectionCard>
      ))}
    </>
  );
}

/**
 * Whether an item takes changes, and the lists the log form offers for it:
 * ingredients a guest can ask to leave off, and things they can add or swap.
 * Comma separated, so a leader can fix a list without a form per ingredient.
 */
function ModsEditor({ item, onSaved }: { item: MenuItemView; onSaved: () => void }) {
  const router = useRouter();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [modifiable, setModifiable] = useState(item.modifiable);
  const [ingredients, setIngredients] = useState(item.ingredients.join(", "));
  const [addons, setAddons] = useState(item.addons.join(", "));
  const [error, setError] = useState<string | null>(null);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setMenuItemMods({ id: item.id, modifiable, ingredients, addons });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <form onSubmit={save} className="space-y-3 border-t border-line bg-canvas px-4 py-3">
      <label className="flex min-h-11 items-center gap-3 text-[15px] font-semibold">
        <input
          type="checkbox"
          className="size-5 shrink-0"
          checked={modifiable}
          onChange={(e) => setModifiable(e.target.checked)}
        />
        <span>Guests can ask for changes on this item</span>
      </label>
      {modifiable && (
        <>
          <div>
            <label htmlFor={`${formId}-ing`} className={LABEL}>
              Ingredients a guest can leave off (separate with commas)
            </label>
            <textarea
              id={`${formId}-ing`}
              className={cn(FIELD, "py-2")}
              rows={2}
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder="Pickles, Tomato, Lettuce"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-add`} className={LABEL}>
              Things a guest can add or swap (separate with commas)
            </label>
            <textarea
              id={`${formId}-add`}
              className={cn(FIELD, "py-2")}
              rows={2}
              value={addons}
              onChange={(e) => setAddons(e.target.value)}
              placeholder="Extra sauce, Grilled instead of crispy"
            />
          </div>
        </>
      )}
      <ErrorLine message={error} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-accent px-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
