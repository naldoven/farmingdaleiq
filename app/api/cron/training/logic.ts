/**
 * Pure helpers for the S4 re-rate cron (ARCHITECTURE.md "Position Ratings" >
 * "Re-rate prompts": "30 days after a rating on an actively-worked position,
 * the system nudges a leader to re-rate"). Kept side-effect-free so the
 * "actively worked" gate is directly unit-testable without a DB.
 */

/** How far back a setup_assignments row still counts as "actively worked"
 * for the purpose of deciding whether a stale rating deserves a re-rate
 * nudge. */
export const ACTIVELY_WORKED_WINDOW_DAYS = 30;

export interface AssignmentLike {
  user_id: string | null;
  position_id: string | null;
}

/** Builds the set of `${user_id}:${position_id}` pairs that have at least
 * one setup_assignments row (already pre-filtered by the caller to recent
 * setups) -- i.e. positions someone has actually been assigned to lately. */
export function activelyWorkedKeys(assignments: AssignmentLike[]): Set<string> {
  const keys = new Set<string>();
  for (const a of assignments) {
    if (a.user_id && a.position_id) {
      keys.add(`${a.user_id}:${a.position_id}`);
    }
  }
  return keys;
}

/** Whether a given (user, position) current rating should get a fresh
 * rerate_prompts row: no prompt already open for the pair, and the position
 * has actually been worked recently (join gate on setup_assignments) -- not
 * just "any rating older than 30 days", which nudges forever even for a
 * position the person hasn't touched in months. */
export function shouldCreateReratePrompt(params: {
  hasOpenPrompt: boolean;
  activelyWorked: boolean;
}): boolean {
  return !params.hasOpenPrompt && params.activelyWorked;
}
