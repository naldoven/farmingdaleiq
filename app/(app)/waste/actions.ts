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
import { emitEvent } from "@/lib/events/bus";
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
 * Best-effort audit trail. The mutation has already committed by the time this
 * runs, so a failure to record the event must not surface as an action failure
 * and mislead the caller into thinking the write didn't happen. Same
 * "emitEventSafely" precedent as app/(app)/tokens/actions.ts.
 */
async function emitEventSafely(
  key: Parameters<typeof emitEvent>[0],
  payload: Record<string, unknown>,
) {
  try {
    await emitEvent(key, payload);
  } catch (error) {
    console.error(`waste actions: emitEvent(${key}) failed`, error);
  }
}

/**
 * Postgres/PostgREST errors reach the UI verbatim if we hand back
 * `error.message`, which leaks table, column, and constraint names to any
 * signed-in team member and reads as gibberish on a phone ("new row violates
 * row-level security policy for table \"waste_entries\""). Map the codes we can
 * actually hit to plain sentences and fall back to a generic line.
 */
function friendlyDbError(
  error: { code?: string; message?: string } | null,
  fallback: string,
): string {
  switch (error?.code) {
    case "23505": // unique_violation -- lost a race against the unique index
      return "That name is already taken. Try a different one.";
    case "23514": // check_violation -- quantity/cost bounds
      return "That value is out of the allowed range.";
    case "23503": // foreign_key_violation
      return "That record is still referenced by other records.";
    case "42501": // insufficient_privilege
    case "PGRST301":
      return "You don't have permission to do this.";
    default:
      return fallback;
  }
}

/**
 * Case-insensitive duplicate-name guard, matching the DB indexes in
 * supabase/migrations/20260707100006_waste_name_unique.sql exactly:
 * categories are unique store-wide on lower(name), items are unique
 * PER CATEGORY on (category_id, lower(name)).
 *
 * The item check previously ignored `categoryId` and rejected store-wide, so a
 * legitimate "Fries" under both Sides and Breakfast was refused even though the
 * DB allowed it -- the app was stricter than the schema and the real rule lived
 * in neither layer alone. Uncategorized items are treated as one bucket here
 * and are backed by a matching partial unique index (see
 * supabase/migrations/20260801000000_waste_hardening.sql), because Postgres
 * treats NULLs as distinct and would otherwise permit duplicates the app blocks.
 *
 * Fetches the small admin-maintained table rather than using `.ilike()` so a
 * name containing `%`/`_` (ilike wildcards) can't produce a false match/miss.
 * A failed query throws rather than returning "no duplicate": swallowing it
 * would turn a clean app-level rejection into a raw unique-violation from the
 * DB one line later.
 */
async function findDuplicateNameId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "waste_categories" | "waste_items",
  name: string,
  options: { excludeId?: string; categoryId?: string | null } = {},
): Promise<string | null> {
  const target = name.trim().toLowerCase();
  const sameName = (rowName: string) => rowName.trim().toLowerCase() === target;

  // Separate branches with literal select strings: passing a computed string to
  // .select() loses supabase-js's response typing entirely.
  if (table === "waste_items") {
    const { data, error } = await supabase.from("waste_items").select("id, name, category_id");
    if (error) {
      throw new Error(`Could not check existing names: ${error.message}`);
    }
    const match = (data ?? []).find(
      (row) =>
        row.id !== options.excludeId &&
        sameName(row.name) &&
        (row.category_id ?? null) === (options.categoryId ?? null),
    );
    return match?.id ?? null;
  }

  const { data, error } = await supabase.from("waste_categories").select("id, name");
  if (error) {
    throw new Error(`Could not check existing names: ${error.message}`);
  }
  const match = (data ?? []).find((row) => row.id !== options.excludeId && sameName(row.name));
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

    // Fail rather than write an unattributed row. `logged_by` is nullable and
    // RLS explicitly permits null, so a session that lapsed between the
    // has_permission RPC and getUser() used to land silently as an anonymous
    // entry -- and because waste_entries has no UPDATE policy, nobody could
    // ever repair it. For a module whose whole purpose is tracking, a clean
    // "sign in again" beats a permanently unattributable number.
    if (!user) {
      return { ok: false, error: "Your session expired. Sign in again to log waste." };
    }

    const { data, error } = await supabase
      .from("waste_entries")
      .insert({
        item_id: parsed.itemId,
        quantity: parsed.quantity,
        day_part_id: parsed.dayPartId ? parsed.dayPartId : null,
        note: parsed.note ? parsed.note : null,
        logged_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: friendlyDbError(error, "Could not log this waste entry.") };
    }

    await emitEventSafely("waste_logged", {
      actor_id: user.id,
      entry_id: data.id,
      item_id: parsed.itemId,
      quantity: parsed.quantity,
    });

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

    // Snapshot the row BEFORE deleting: this is a hard delete with no
    // soft-delete column, so the emitted event is the only surviving record
    // that the entry ever existed. Without the snapshot the audit trail would
    // say "an entry was deleted" and nothing about which one or how costly.
    const { data: existing } = await supabase
      .from("waste_entries")
      .select("id, item_id, quantity, logged_by, logged_at")
      .eq("id", parsed.id)
      .maybeSingle();

    // `.delete()` reports success even when RLS filters the row set to zero, so
    // ask for the deleted rows back and treat an empty result as a failure
    // rather than showing a green toast for a delete that never happened.
    const { data: deleted, error } = await supabase
      .from("waste_entries")
      .delete()
      .eq("id", parsed.id)
      .select("id");

    if (error) {
      return { ok: false, error: friendlyDbError(error, "Could not delete this entry.") };
    }

    if (!deleted || deleted.length === 0) {
      return { ok: false, error: "That entry no longer exists." };
    }

    await emitEventSafely("waste_entry_deleted", {
      entry_id: parsed.id,
      item_id: existing?.item_id ?? null,
      quantity: existing?.quantity ?? null,
      original_logged_by: existing?.logged_by ?? null,
      original_logged_at: existing?.logged_at ?? null,
    });

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
      return { ok: false, error: friendlyDbError(error, "Could not create the category.") };
    }

    await emitEventSafely("waste_category_changed", {
      action: "created",
      category_id: data.id,
      name: parsed.name,
    });

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

    if (
      await findDuplicateNameId(supabase, "waste_categories", parsed.name, {
        excludeId: parsed.id,
      })
    ) {
      return { ok: false, error: "A category with this name already exists." };
    }

    // `.select("id")` + a row-count check: under RLS a write filtered to zero
    // rows returns success, so without this the UI shows a green result for a
    // change that never happened.
    const { data: updated, error } = await supabase
      .from("waste_categories")
      .update({ name: parsed.name, sort: parsed.sort })
      .eq("id", parsed.id)
      .select("id");

    if (error) {
      return { ok: false, error: friendlyDbError(error, "Could not update the category.") };
    }

    if (!updated || updated.length === 0) {
      return { ok: false, error: "That category no longer exists." };
    }

    await emitEventSafely("waste_category_changed", {
      action: "updated",
      category_id: parsed.id,
      name: parsed.name,
    });

    revalidatePath("/waste");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * Deleting a category requires it to be empty.
 *
 * This used to be a lie the UI told: waste_items.category_id was ON DELETE
 * CASCADE, so deleting a category silently destroyed every item in it -- names,
 * units, and unit costs -- while the confirmation dialog promised "It must have
 * no items left in it." The only thing that ever blocked the delete was the
 * waste_entries.item_id FK one level further down, which bites only once waste
 * has actually been logged. On a freshly configured category (exactly the state
 * early setup and testing are in) the delete succeeded and took all the item
 * configuration with it, with no undo.
 *
 * supabase/migrations/20260801000000_waste_hardening.sql switches that FK to ON
 * DELETE RESTRICT so the database enforces what the dialog always claimed. The
 * explicit pre-check here exists so the user gets a specific, actionable count
 * ("3 items") instead of a generic FK rejection.
 */
export async function deleteCategory(input: IdInput): Promise<ActionResult> {
  try {
    await requirePermission("waste.manage");

    const parsed = idSchema.parse(input);
    const supabase = await createClient();

    const { count, error: countError } = await supabase
      .from("waste_items")
      .select("id", { count: "exact", head: true })
      .eq("category_id", parsed.id);

    if (countError) {
      return { ok: false, error: friendlyDbError(countError, "Could not delete this category.") };
    }

    if ((count ?? 0) > 0) {
      const plural = count === 1 ? "item" : "items";
      return {
        ok: false,
        error: `This category still has ${count} ${plural}. Move or delete them first.`,
      };
    }

    // `.select("id")` + a row-count check: under RLS a write filtered to zero
    // rows returns success, so without this the UI shows a green result for a
    // change that never happened.
    const { data: deleted, error } = await supabase
      .from("waste_categories")
      .delete()
      .eq("id", parsed.id)
      .select("id");

    if (error) {
      return { ok: false, error: friendlyDbError(error, "Could not delete this category.") };
    }

    if (!deleted || deleted.length === 0) {
      return { ok: false, error: "That category no longer exists." };
    }

    await emitEventSafely("waste_category_changed", {
      action: "deleted",
      category_id: parsed.id,
    });

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

    const categoryId = parsed.categoryId ? parsed.categoryId : null;

    if (await findDuplicateNameId(supabase, "waste_items", parsed.name, { categoryId })) {
      return { ok: false, error: "An item with this name already exists in this category." };
    }

    const { data, error } = await supabase
      .from("waste_items")
      .insert({
        name: parsed.name,
        category_id: categoryId,
        unit: parsed.unit,
        unit_cost: parsed.unitCost ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { ok: false, error: friendlyDbError(error, "Could not create the item.") };
    }

    await emitEventSafely("waste_item_changed", {
      action: "created",
      item_id: data.id,
      name: parsed.name,
      unit: parsed.unit,
      unit_cost: parsed.unitCost ?? null,
    });

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

    const categoryId = parsed.categoryId ? parsed.categoryId : null;

    if (
      await findDuplicateNameId(supabase, "waste_items", parsed.name, {
        excludeId: parsed.id,
        categoryId,
      })
    ) {
      return { ok: false, error: "An item with this name already exists in this category." };
    }

    // Capture the prior cost for the audit event. Editing unit_cost
    // retroactively rewrites every historical rollup that references this item
    // (rollups read the item's CURRENT cost -- see the KNOWN LIMITATION note on
    // rollupByItem in logic.ts), so "what was it before?" is the single most
    // useful thing this event can carry.
    const { data: previous } = await supabase
      .from("waste_items")
      .select("name, unit, unit_cost")
      .eq("id", parsed.id)
      .maybeSingle();

    // `.select("id")` + a row-count check: under RLS a write filtered to zero
    // rows returns success, so without this the UI shows a green result for a
    // change that never happened.
    const { data: updated, error } = await supabase
      .from("waste_items")
      .update({
        name: parsed.name,
        category_id: categoryId,
        unit: parsed.unit,
        unit_cost: parsed.unitCost ?? null,
      })
      .eq("id", parsed.id)
      .select("id");

    if (error) {
      return { ok: false, error: friendlyDbError(error, "Could not update the item.") };
    }

    if (!updated || updated.length === 0) {
      return { ok: false, error: "That item no longer exists." };
    }

    await emitEventSafely("waste_item_changed", {
      action: "updated",
      item_id: parsed.id,
      name: parsed.name,
      unit: parsed.unit,
      unit_cost: parsed.unitCost ?? null,
      previous_unit_cost: previous?.unit_cost ?? null,
    });

    revalidatePath("/waste");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}

/**
 * waste_entries.item_id is a not-null FK with no ON DELETE clause
 * (RESTRICT), so deleting an item that already has entries logged against
 * it fails at the DB level.
 *
 * The failure is now distinguished by Postgres error code rather than assumed:
 * the old code mapped EVERY error to "It already has waste logged against it",
 * so an RLS rejection or a connectivity blip sent the manager off to hunt for
 * entries that were never the problem.
 */
export async function deleteItem(input: IdInput): Promise<ActionResult> {
  try {
    await requirePermission("waste.manage");

    const parsed = idSchema.parse(input);
    const supabase = await createClient();

    // `.select("id")` + a row-count check: under RLS a write filtered to zero
    // rows returns success, so without this the UI shows a green result for a
    // change that never happened.
    const { data: deleted, error } = await supabase
      .from("waste_items")
      .delete()
      .eq("id", parsed.id)
      .select("id");

    if (error) {
      if (error.code === "23503") {
        return {
          ok: false,
          error: "Could not delete this item. It already has waste logged against it.",
        };
      }
      return { ok: false, error: friendlyDbError(error, "Could not delete this item.") };
    }

    if (!deleted || deleted.length === 0) {
      return { ok: false, error: "That item no longer exists." };
    }

    await emitEventSafely("waste_item_changed", {
      action: "deleted",
      item_id: parsed.id,
    });

    revalidatePath("/waste");
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: toActionError(error) };
  }
}
