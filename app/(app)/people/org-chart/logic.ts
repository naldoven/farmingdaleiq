/** Pure helpers for the Org Chart (ARCHITECTURE.md "Trainee lifecycle" >
 * "Org chart"): a tier's `goal_count` vacant slots should exist as soon as
 * the tier does, so a pipeline stamp (stampPassport in
 * app/(app)/training/actions.ts) has a slot to auto-fill instead of finding
 * none. */

export interface NewOrgSlotRow {
  tier_id: string;
  sort: number;
}

/** Builds `goalCount` vacant (unlabeled) slot rows for a freshly created
 * tier, sorted 0..goalCount-1. Returns an empty array for a zero/negative
 * goal count. */
export function buildVacantSlotRows(tierId: string, goalCount: number): NewOrgSlotRow[] {
  if (goalCount <= 0) return [];
  return Array.from({ length: goalCount }, (_, i) => ({ tier_id: tierId, sort: i }));
}
