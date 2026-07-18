import type { SupabaseClient } from "@supabase/supabase-js";

import { emitEvent } from "@/lib/events/bus";
import { buildTaskAssignedEvent } from "@/app/(app)/tasks/events";
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
 * Content resolved by an out-of-band lookup for events whose payload only
 * carries a foreign key, not display text. `processTaskEvents` fills this in
 * for `follow_up_assigned` (whose payload is just {source_answer_id, run_id});
 * `mapEventToTaskInsert` stays pure and testable by taking it as an argument.
 */
export interface ResolvedFollowUp {
  followUpId: string | null;
  questionPrompt: string | null;
  description: string | null;
  assignedUserId: string | null;
  dueAt: string | null;
}

/** Extracts the source-answer id from a follow_up_assigned payload, tolerating
 * both the canonical snake_case (`source_answer_id`) and the checklist
 * producer's camelCase (`sourceAnswerId`). Pure so the lookup step in
 * processTaskEvents can reuse it. */
export function followUpSourceAnswerId(payload: Record<string, unknown>): string | undefined {
  return str(payload.source_answer_id) ?? str(payload.sourceAnswerId);
}

function followUpRunId(payload: Record<string, unknown>): string | undefined {
  return str(payload.run_id) ?? str(payload.runId);
}

/**
 * Maps one app_events row to a `tasks` insert, or `null` if the event isn't
 * one this consumer handles or is missing the fields it needs. Pure (no I/O)
 * so it's unit-testable without a database (system-tasks.test.ts). Content that
 * requires a DB lookup (follow-up question text / assignee / due date) is
 * passed in via `resolved`.
 */
export function mapEventToTaskInsert(
  event: AppEventRow,
  resolved: { followUp?: ResolvedFollowUp | null } = {},
): SystemTaskInsert | null {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const date = event.created_at.slice(0, 10);
  const ref = { event_id: event.id, source: event.event_key } as Record<string, unknown>;

  switch (event.event_key as SystemTaskEventKey) {
    case "reward_claim": {
      // Canonical payload emitted by rewards.claimReward (app/(app)/rewards/
      // actions.ts): { claim_id, user_id, reward_id, reward_name, cost }. The
      // claimant (user_id) is recorded in ref for traceability; the fulfillment
      // task itself stays unassigned (a pool task for whoever fulfills rewards).
      const claimId = str(payload.claim_id);
      if (!claimId) return null;
      const claimantId = str(payload.user_id) ?? null;
      return {
        kind: "reward_fulfillment",
        title: `Fulfill reward: ${str(payload.reward_name) ?? "reward"}`,
        description: null,
        date,
        status: "pending",
        token_value: 0,
        ref: { ...ref, reward_claim_id: claimId, claimed_by: claimantId } as Json,
      };
    }

    case "follow_up_assigned": {
      // Canonical payload emitted by checklists.completeRun for a flagged
      // answer: { source_answer_id, run_id }. The payload carries only foreign
      // keys, so the human-readable title, the assignee, and the due date come
      // from `resolved` (a lookup against the follow_up + its question, done in
      // processTaskEvents). `user_id` is honored if a producer ever supplies a
      // direct assignee inline.
      const sourceAnswerId = followUpSourceAnswerId(payload) ?? null;
      const runId = followUpRunId(payload) ?? null;
      const followUp = resolved.followUp ?? null;
      const assignedUserId =
        followUp?.assignedUserId ?? str(payload.user_id) ?? str(payload.assigned_user_id) ?? null;
      const title =
        followUp?.questionPrompt
          ? `Follow-up: ${followUp.questionPrompt}`
          : (str(payload.title) ?? "Follow-up needed");
      return {
        kind: "follow_up",
        title,
        description: followUp?.description ?? str(payload.description) ?? null,
        date,
        assigned_user_id: assignedUserId,
        assigned_position_id: assignedUserId ? null : (str(payload.assigned_position_id) ?? null),
        due_at: followUp?.dueAt ?? null,
        status: "pending",
        token_value: 0,
        ref: {
          ...ref,
          follow_up_id: followUp?.followUpId ?? str(payload.follow_up_id) ?? null,
          source_answer_id: sourceAnswerId,
          run_id: runId,
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

interface FollowUpLookupRow {
  id: string | null;
  source_answer_id: string | null;
  description: string | null;
  assigned_to: string | null;
  due_at: string | null;
  checklist_answers:
    | { checklist_questions: { prompt: string | null } | { prompt: string | null }[] | null }
    | { checklist_questions: { prompt: string | null } | { prompt: string | null }[] | null }[]
    | null;
}

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Batched content lookup for follow_up_assigned events. Given the flagged
 * answers' ids, returns per-source-answer the follow-up's own id/description/
 * assignee/due date plus the originating checklist question's prompt (for a
 * meaningful task title). Best-effort: on any error it returns whatever it
 * resolved, and the caller falls back to the payload/defaults.
 *
 * S2 owns only tasks/task_templates, but the parity audit sanctions this
 * read-only lookup so a follow-up task is traceable instead of generic — it
 * reads the other modules' tables, never writes them.
 */
async function resolveFollowUps(
  supabase: SupabaseClient<Database>,
  sourceAnswerIds: string[],
): Promise<Map<string, ResolvedFollowUp>> {
  const map = new Map<string, ResolvedFollowUp>();
  const unique = [...new Set(sourceAnswerIds)];
  if (unique.length === 0) return map;

  const { data, error } = await supabase
    .from("follow_ups")
    .select(
      "id, source_answer_id, description, assigned_to, due_at, checklist_answers(checklist_questions(prompt))",
    )
    .in("source_answer_id", unique);

  if (error || !data) return map;

  for (const row of data as unknown as FollowUpLookupRow[]) {
    if (!row.source_answer_id) continue;
    const answer = firstOf(row.checklist_answers);
    const question = answer ? firstOf(answer.checklist_questions) : null;
    map.set(row.source_answer_id, {
      followUpId: row.id ?? null,
      questionPrompt: question?.prompt ?? null,
      description: row.description ?? null,
      assignedUserId: row.assigned_to ?? null,
      dueAt: row.due_at ?? null,
    });
  }

  return map;
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

  // Oldest-first: combined with the own-table idempotency check below, each run
  // drains the oldest unhandled events, so a burst larger than `limit` clears
  // over successive ticks instead of permanently starving the oldest events
  // (the bug when this ordered newest-first with a hard 200 cap).
  const { data: events, error: eventsError } = await supabase
    .from("app_events")
    .select("id, event_key, payload, created_at")
    .in("event_key", SYSTEM_TASK_EVENT_KEYS)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (eventsError) {
    throw new Error(`processTaskEvents: could not load events: ${eventsError.message}`);
  }
  if (!events || events.length === 0) {
    return { created: 0, skipped: 0 };
  }

  // Follow-up events carry only a source_answer_id; resolve the human-readable
  // question text, the assignee, and the due date from the follow_up row and
  // its checklist question in one batched read so the created task is
  // traceable instead of a generic "Follow-up needed".
  const followUpByAnswerId = await resolveFollowUps(
    supabase,
    (events as AppEventRow[])
      .filter((e) => e.event_key === "follow_up_assigned")
      .map((e) => followUpSourceAnswerId((e.payload ?? {}) as Record<string, unknown>))
      .filter((v): v is string => Boolean(v)),
  );

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

    const followUp =
      event.event_key === "follow_up_assigned"
        ? (followUpByAnswerId.get(
            followUpSourceAnswerId((event.payload ?? {}) as Record<string, unknown>) ?? "",
          ) ?? null)
        : null;
    const insert = mapEventToTaskInsert(event, { followUp });
    if (!insert) {
      skipped += 1;
      continue;
    }

    const { data: taskRow, error: insertError } = await supabase
      .from("tasks")
      .insert(insert)
      .select("id, kind, ref, assigned_user_id")
      .single();

    if (insertError || !taskRow) {
      throw new Error(
        `processTaskEvents: could not create task for event ${event.id}: ${insertError?.message}`,
      );
    }

    created += 1;

    try {
      // N2 fix: carry the assignee so extractRecipientIds can resolve them.
      // The previous payload had no user_id/assigned_user_id, so a system task
      // created here (e.g. a follow_up with a real assignee) notified nobody.
      // buildTaskAssignedEvent sets `user_id` = the assignee (the recipient
      // key the notify drain reads); a pool task (assigned_user_id null) still
      // correctly resolves to "no one".
      await emitEvent(
        "task_assigned",
        buildTaskAssignedEvent({
          taskId: taskRow.id,
          assignedUserId: taskRow.assigned_user_id ?? null,
          kind: taskRow.kind,
          ref: taskRow.ref,
        }),
      );
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
