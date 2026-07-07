import type { SupabaseClient } from "@supabase/supabase-js";

import { emitEvent } from "@/lib/events/bus";
import type { Database, Json } from "@/lib/db/types";

/**
 * Event-bus consumer that turns cross-module events into system-created
 * `tasks` rows (PLAN.md S2 brief: "System-created task kinds
 * (reward_fulfillment, follow_up, lead_duty) accepted via event bus
 * consumer."). S2 owns `tasks`/`task_templates` only, so this file never
 * reads or writes another module's tables directly — it only reads the
 * shared `app_events` table (lib/events/bus.ts) and writes its own `tasks`
 * table, exactly per PLAN.md's cross-module rule ("emit events via
 * emitEvent, and for anything you consume, read the app_events / your own
 * tables idempotently within YOUR code").
 *
 * Idempotency: `app_events.processed_at` is a single shared column that
 * every consumer (S2 here, S7 tokens, S10 notifications) would stomp on if
 * each used it as its own "have I handled this" flag. Instead this consumer
 * stores the source event id in `tasks.ref->>'event_id'` and de-dupes against
 * that, so it never double-creates a task for the same event no matter how
 * many times (or how often) the sync route runs, and never interferes with
 * another consumer's use of the same app_events rows.
 *
 * After creating a system task this emits `task_assigned` with the new
 * task's id and its `ref` payload. That is intentionally the *only* way
 * another module (e.g. S7 setting `reward_claims.fulfillment_task_id`) can
 * learn the created task's id — S2 must not write into another module's
 * table directly.
 *
 * Payload shape assumptions below are documented per event key; `reward_claim`
 * and `follow_up_assigned` are read defensively (missing/malformed fields =>
 * skip, never throw) since the emitting modules' exact payload shape is
 * outside S2's ownership. `setup_posted` -> `lead_duty` is a best-effort
 * mapping flagged for P2 confirmation once S3 (Setups) lands — see the
 * stream report.
 */

export type SystemTaskEventKey = "reward_claim" | "follow_up_assigned" | "setup_posted";

export const SYSTEM_TASK_EVENT_KEYS: SystemTaskEventKey[] = [
  "reward_claim",
  "follow_up_assigned",
  "setup_posted",
];

export interface AppEventRow {
  id: string;
  event_key: string;
  payload: unknown;
  created_at: string;
}

export type SystemTaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Maps one app_events row to a `tasks` insert, or `null` if the event isn't
 * one this consumer handles or is missing the fields it needs. Pure (no I/O)
 * so it's unit-testable without a database (system-tasks.test.ts).
 */
export function mapEventToTaskInsert(event: AppEventRow): SystemTaskInsert | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const date = event.created_at.slice(0, 10);
  const ref = { event_id: event.id, source: event.event_key } as Record<string, unknown>;

  switch (event.event_key as SystemTaskEventKey) {
    case "reward_claim": {
      // Assumed payload (emitted by S7, ARCHITECTURE.md "Tokens & Rewards" /
      // reward_claims): { reward_claim_id, reward_name, user_name }.
      const claimId = str(payload.reward_claim_id);
      if (!claimId) return null;
      return {
        kind: "reward_fulfillment",
        title: `Fulfill reward: ${str(payload.reward_name) ?? "reward"}`,
        description: str(payload.user_name)
          ? `Claimed by ${str(payload.user_name)}.`
          : null,
        date,
        status: "pending",
        token_value: 0,
        ref: { ...ref, reward_claim_id: claimId } as Json,
      };
    }

    case "follow_up_assigned": {
      // Assumed payload (emitted by S1 Checklists for a flagged answer, or
      // by S4 for a training follow-up): { follow_up_id?, title?,
      // description?, assigned_user_id?, assigned_position_id? }.
      const assignedUserId = str(payload.assigned_user_id);
      const assignedPositionId = str(payload.assigned_position_id);
      return {
        kind: "follow_up",
        title: str(payload.title) ?? "Follow-up needed",
        description: str(payload.description) ?? null,
        date,
        assigned_user_id: assignedUserId ?? null,
        assigned_position_id: assignedUserId ? null : (assignedPositionId ?? null),
        status: "pending",
        token_value: 0,
        ref: {
          ...ref,
          follow_up_id: str(payload.follow_up_id) ?? null,
        } as Json,
      };
    }

    case "setup_posted": {
      // Assumed payload (emitted by S3 on posting a setup): { setup_id,
      // day_part_id?, leader_user_id? }. Best-effort: a Lead Duties task for
      // whoever is leading the shift. Skipped (returns null) when no leader
      // can be identified, so this silently no-ops until S3's real payload
      // shape is confirmed in P2 rather than creating garbage tasks.
      const setupId = str(payload.setup_id);
      const leaderUserId = str(payload.leader_user_id) ?? str(payload.leader_id);
      if (!setupId || !leaderUserId) return null;
      return {
        kind: "lead_duty",
        title: "Lead Duties",
        description: null,
        date,
        day_part_id: str(payload.day_part_id) ?? null,
        assigned_user_id: leaderUserId,
        status: "pending",
        token_value: 0,
        ref: { ...ref, setup_id: setupId } as Json,
      };
    }

    default:
      return null;
  }
}

/**
 * Reads recent app_events for the event keys this consumer handles, creates
 * any missing system tasks, and emits `task_assigned` for each one created.
 * Safe to call as often as the sync route likes (see app/api/tasks/sync);
 * every step is guarded so re-running never double-creates a task.
 */
export async function processTaskEvents(
  supabase: SupabaseClient<Database>,
  opts: { lookbackLimit?: number } = {},
): Promise<{ created: number; skipped: number }> {
  const limit = num(opts.lookbackLimit) ?? 200;

  const { data: events, error: eventsError } = await supabase
    .from("app_events")
    .select("id, event_key, payload, created_at")
    .in("event_key", SYSTEM_TASK_EVENT_KEYS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventsError) {
    throw new Error(`processTaskEvents: could not load events: ${eventsError.message}`);
  }
  if (!events || events.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // Own-table idempotency check: which of these events already produced a
  // task (tasks.ref->>'event_id' recorded at creation time, see above).
  const { data: existingRefs, error: refsError } = await supabase
    .from("tasks")
    .select("ref")
    .in("kind", ["reward_fulfillment", "follow_up", "lead_duty"]);

  if (refsError) {
    throw new Error(`processTaskEvents: could not check existing tasks: ${refsError.message}`);
  }

  const alreadyHandled = new Set(
    (existingRefs ?? [])
      .map((r) => (r.ref as Record<string, unknown> | null)?.event_id)
      .filter((v): v is string => typeof v === "string"),
  );

  let created = 0;
  let skipped = 0;

  for (const event of events as AppEventRow[]) {
    if (alreadyHandled.has(event.id)) {
      skipped += 1;
      continue;
    }

    const insert = mapEventToTaskInsert(event);
    if (!insert) {
      skipped += 1;
      continue;
    }

    const { data: taskRow, error: insertError } = await supabase
      .from("tasks")
      .insert(insert)
      .select("id, kind, ref")
      .single();

    if (insertError || !taskRow) {
      throw new Error(
        `processTaskEvents: could not create task for event ${event.id}: ${insertError?.message}`,
      );
    }

    created += 1;

    try {
      await emitEvent("task_assigned", {
        task_id: taskRow.id,
        kind: taskRow.kind,
        ref: taskRow.ref,
      });
    } catch {
      // emitEvent (lib/events/bus.ts, frozen) writes through the per-request
      // cookie-bound client; this consumer typically runs from an
      // unauthenticated scheduled route where that write may not be
      // permitted yet (see app/api/tasks/sync/route.ts header comment). The
      // task row itself is the durable side effect and is never lost; losing
      // one notification hook is an acceptable degradation, not a reason to
      // abort the whole batch.
    }
  }

  return { created, skipped };
}
