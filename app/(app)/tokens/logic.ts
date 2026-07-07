/**
 * Pure logic for the Tokens module. Dependency-free (no Supabase client) so
 * it's directly unit-testable and shared between app/(app)/tokens/page.tsx
 * (display) and app/api/cron/tokens/route.ts (the earning-rule event
 * consumer). Same "logic.ts kept pure" pattern as app/(app)/waste/logic.ts.
 */

export const TOKEN_TRANSACTION_KIND_LABELS: Record<string, string> = {
  earn: "Earned",
  recognition: "Recognition",
  top_performer: "Top Performer",
  gift_in: "Gift received",
  gift_out: "Gift sent",
  redeem: "Reward redeemed",
  adjust: "Adjustment",
};

export function transactionKindLabel(kind: string): string {
  return TOKEN_TRANSACTION_KIND_LABELS[kind] ?? kind;
}

/** Advisory-only client-side check; the real cap is enforced by gift_tokens() in Postgres. */
export function canAffordGift(balance: number, amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && balance >= amount;
}

/**
 * The event-consumer's resolution rule for how many tokens a task/checklist
 * completion is worth (PLAN.md S7: "earning-rule consumer of task_complete,
 * checklist_complete, top_performer events"): if the completing module
 * already put a specific token_value on the event payload (a task or
 * checklist question can carry its own token_value per
 * ARCHITECTURE.md's data model), that wins; otherwise fall back to this
 * event key's row in token_earning_rules. Either way, a non-positive result
 * means "don't award anything" rather than a negative transaction.
 */
export function resolveEarnAmount(payloadTokenValue: unknown, ruleAmount: number): number {
  if (typeof payloadTokenValue === "number" && Number.isFinite(payloadTokenValue) && payloadTokenValue > 0) {
    return Math.trunc(payloadTokenValue);
  }
  return Math.max(0, Math.trunc(ruleAmount || 0));
}

export interface AppEventForConsumer {
  id: string;
  event_key: string;
  payload: Record<string, unknown> | null;
}

export interface ResolvedTokenAward {
  eventId: string;
  userId: string;
  amount: number;
  kind: "earn" | "top_performer";
}

/**
 * Turns a batch of unprocessed app_events (task_complete / checklist_complete
 * / top_performer) into the token awards the consumer should make, given the
 * current token_earning_rules amounts. Skips events with no resolvable
 * recipient or a non-positive amount. Pure so the resolution rule is
 * unit-testable without a database.
 */
export function resolveAwardsForEvents(
  events: AppEventForConsumer[],
  ruleAmountByEventKey: Record<string, number>
): ResolvedTokenAward[] {
  const awards: ResolvedTokenAward[] = [];

  for (const event of events) {
    const payload = event.payload ?? {};
    const userId = typeof payload.user_id === "string" ? payload.user_id : null;
    if (!userId) continue;

    const ruleAmount = ruleAmountByEventKey[event.event_key] ?? 0;
    const amount = resolveEarnAmount(payload.token_value, ruleAmount);
    if (amount <= 0) continue;

    awards.push({
      eventId: event.id,
      userId,
      amount,
      kind: event.event_key === "top_performer" ? "top_performer" : "earn",
    });
  }

  return awards;
}
