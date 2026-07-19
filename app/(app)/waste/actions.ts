"use server";

/**
 * Waste server actions. Follows the reference pattern in
 * app/(app)/people/actions.ts (see that file's header comment for the full
 * rationale): every action calls requirePermission() before touching the
 * DB, mutations go through the per-request client so Postgres RLS
 * (supabase/migrations/<timestamp>_waste_rls.sql) independently re-checks
 * the same permission, and every action returns a discriminated
 * ActionResult instead of throwing.
 *
 * Idempotency note (PLAN.md hard boundary: "any action that can be
 * double-submitted ... must be safe to run twice"): waste_entries is a
 * frozen table (supabase/migrations/20260707000900_waste.sql, owned by P0)
 * with no dedupe/request-id column available to add (streams cannot add
 * columns per PLAN.md ground rules). logWasteEntry is therefore guarded the
 * practical way instead -- the log form (components/waste/log-entry-form.tsx)
 * disables its submit button for the duration of the pending transition, so
 * a double-tap cannot fire two requests. A true double-submission (e.g. two
 * separate deliberate taps) intentionally creates two entries: that's
 * correct waste-logging behavior (two pans of chicken really were wasted),
 * not a bug -- unlike a double POST of a setup or a double-claim of a
 * reward, logging waste has no "already posted" state to violate. Mistaken
 * entries are corrected via deleteWasteEntry (waste.manage), not by
 * de-duplicating inserts.
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/permissions";
import { toActionError } from "@/lib/errors/action-error";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/waste/action-types";
import {
  createCategorySchema,
  createItemSchema,
  idSchema,
  logEntrySchema,
  updateCategorySchema,
  updateItemSchema,
  type CreateCategoryInput,
  type CreateItemInput,
  type IdInput,
  type LogEntryInput,
  type UpdateCategoryInput,
  type UpdateItemInput,
} from "@/app/(app)/waste/validation";

/**
 * Case-insensitive duplicate-name guard. There's no unique constraint on
 * waste_categories.name / waste_items.name at the DB level (that's a schema
 * change outside this stream's owned files), so this is the app-layer
 * substitute: "Chicken" and "chicken" would otherwise silently become two
 * separate rows that split the same waste across two rollup lines. Fetches
 * the small admin-maintained table rather than using `.ilike()` so a name
 * containing `%`/`_` (ilike wildcards) can't produce a false match/miss.
 */
async function findDuplicateNameId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "waste_categories" | "waste_items",
  name: string,
  excludeId?: string,
): Promise<string | null> {
  const { data } = await supabase.from(table).select("id, name");
  const target = name.trim().toLowerCase();
  const match = (data ?? []).find(
    (row) => row.id !== excludeId && row.name.trim().toLowerCase() === target,
  );
  return match?.id ?? null;
}

/**
 * Logs one waste entry (ARCHITECTURE.md "Waste": "Anyone can log a waste
 * entry: item + quantity"). `waste.log` is a base permission key granted to
 * every seeded role (supabase/migrations/20260707001900_seed_store_config.sql
 * base_keys), so in practice this is open to any active team member.
 */
export async function logWasteEntry(input: LogEntryInput): Promise<ActionResult> {
  try {
    await requirePermission("waste.log");

    const parsed = logEntrySchema.parse(input);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("waste_entries").insert({
      item_id: parsed.itemId,
      quantity: parsed.quantity,
      day_part_id: parsed.dayPartId ? parsed.dayPartId : null,
      note: parsed.note ? parsed.note : null,
      logged_by: user?.id ?? null,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/waste");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Removes a mis-logged entry. Manager-only (waste.manage) -- there is no
 * self-service delete/edit path (ARCHITECTURE.md describes logging, not
 * correcting), matching the checklists module's follow_ups precedent of
 * gating corrections behind the manage permission.
 */
export async function deleteWasteEntry(input: IdInput): Promise<ActionResult> {
  try {
    await requirePermission("waste.manage");

    const parsed = idSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("waste_entries").delete().eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/waste");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Admin CRUD: waste_categories. */
export async function createCategory(
  input: CreateCategoryInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("waste.manage");

    const parsed = createCategorySchema.parse(input);
    const supabase = await createClient();

    if (await findDuplicateNameId(supabase, "waste_categories", parsed.name)) {
      return { ok: false, error: "A category with this name already exists." };
    }

    const { data, error } = await supabase
      .from("waste_categories")
      .insert({ name: parsed.name, sort: parsed.sort })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the category." };
    }

    revalidatePath("/waste");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateCategory(input: UpdateCategoryInput): Promise<ActionResult> {
  try {
    await requirePermission("waste.manage");

    const parsed = updateCategorySchema.parse(input);
    const supabase = await createClient();

    if (await findDuplicateNameId(supabase, "waste_categories", parsed.name, parsed.id)) {
      return { ok: false, error: "A category with this name already exists." };
    }

    const { error } = await supabase
      .from("waste_categories")
      .update({ name: parsed.name, sort: parsed.sort })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/waste");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Deleting a category cascades to its items at the DB level
 * (waste_items.category_id references waste_categories(id) on delete
 * cascade -- supabase/migrations/20260707000900_waste.sql), which in turn
 * would fail if any of those items still have waste_entries pointing at
 * them (waste_entries.item_id has no ON DELETE clause, i.e. RESTRICT). That
 * failure surfaces here as a normal error result, not a crash.
 */
export async function deleteCategory(input: IdInput): Promise<ActionResult> {
  try {
    await requirePermission("waste.manage");

    const parsed = idSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("waste_categories").delete().eq("id", parsed.id);

    if (error) {
      return {
        ok: false,
        error: "Could not delete this category. Remove or reassign its items first.",
      };
    }

    revalidatePath("/waste");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/** Admin CRUD: waste_items. */
export async function createItem(
  input: CreateItemInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("waste.manage");

    const parsed = createItemSchema.parse(input);
    const supabase = await createClient();

    if (await findDuplicateNameId(supabase, "waste_items", parsed.name)) {
      return { ok: false, error: "An item with this name already exists." };
    }

    const { data, error } = await supabase
      .from("waste_items")
      .insert({
        name: parsed.name,
        category_id: parsed.categoryId ? parsed.categoryId : null,
        unit: parsed.unit,
        unit_cost: parsed.unitCost ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: error?.message ?? "Could not create the item." };
    }

    revalidatePath("/waste");
    return { ok: true, data: { id: data.id } };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

export async function updateItem(input: UpdateItemInput): Promise<ActionResult> {
  try {
    await requirePermission("waste.manage");

    const parsed = updateItemSchema.parse(input);
    const supabase = await createClient();

    if (await findDuplicateNameId(supabase, "waste_items", parsed.name, parsed.id)) {
      return { ok: false, error: "An item with this name already exists." };
    }

    const { error } = await supabase
      .from("waste_items")
      .update({
        name: parsed.name,
        category_id: parsed.categoryId ? parsed.categoryId : null,
        unit: parsed.unit,
        unit_cost: parsed.unitCost ?? null,
      })
      .eq("id", parsed.id);

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/waste");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * waste_entries.item_id is a not-null FK with no ON DELETE clause
 * (RESTRICT), so deleting an item that already has entries logged against
 * it fails at the DB level. Surfaced as a friendly error rather than the
 * raw Postgres message.
 */
export async function deleteItem(input: IdInput): Promise<ActionResult> {
  try {
    await requirePermission("waste.manage");

    const parsed = idSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from("waste_items").delete().eq("id", parsed.id);

    if (error) {
      return {
        ok: false,
        error: "Could not delete this item. It already has waste logged against it.",
      };
    }

    revalidatePath("/waste");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
