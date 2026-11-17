import { createClient } from "@/lib/supabase/server";

/**
 * Rank guard for actions a manager takes ON another person: making a setup
 * link, setting a temporary password, changing their role
 * (docs/STAFF-SIGN-IN-PLAN.md, Steps 1 and 6). `people.manage` alone is not
 * enough: an Assistant Director (rank 3) holds it, and without this check they
 * could take over a Director's sign-in or demote them. The database
 * privilege guard (20260718000000) only stops assigning a role senior to your
 * own; it never looks at the target's current rank.
 */

export const RANK_GUARD_MESSAGE = "You can only do this for people ranked below you.";

export class RankGuardError extends Error {
  constructor(message = RANK_GUARD_MESSAGE) {
    super(message);
    this.name = "RankGuardError";
  }
}

/**
 * True only when the target ranks strictly below the actor (a LOWER rank
 * number is MORE senior, rank 1 = Location Manager) and is not the actor.
 * Same rank is refused on purpose: two Directors cannot reset each other.
 * An actor with no ranked role may act on nobody. A target with no role holds
 * no permissions at all, so any ranked manager may act on them.
 */
export function canActOn(
  actorRank: number | null,
  targetRank: number | null,
  isSelf: boolean,
): boolean {
  if (isSelf) return false;
  if (actorRank == null) return false;
  if (targetRank == null) return true;
  return targetRank > actorRank;
}

/**
 * The rank to hand canActOn for a target: null when they have no role (no
 * permissions, so any ranked manager may act), their role's rank, or 0 for a
 * role that exists but has no rank. 0 ranks above everyone, so an unranked
 * role is refused rather than treated as "no role". Mirrors rule (c) in
 * 20261116000000_privilege_guard_target_rank.sql.
 */
export function guardRank(
  roleId: string | null,
  rankByRole: Map<string, number | null>,
): number | null {
  if (!roleId) return null;
  return rankByRole.get(roleId) ?? 0;
}

/**
 * Server-side form of canActOn for Server Actions. Reads both ranks through
 * the caller's own per-request client (profiles and roles are readable by
 * every store member) and throws RankGuardError when the caller may not act
 * on `targetId`. Call it AFTER requirePermission(). Returns the caller's id
 * so the action can record who did it.
 */
export async function requireOutranks(targetId: string): Promise<{ actorId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new RankGuardError("You must be signed in.");
  }

  const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] =
    await Promise.all([
      supabase.from("profiles").select("id, role_id").in("id", [user.id, targetId]),
      supabase.from("roles").select("id, rank"),
    ]);
  if (profilesError || rolesError) {
    throw new RankGuardError("Could not check rank. Try again.");
  }

  const rankByRole = new Map((roles ?? []).map((r) => [r.id, r.rank]));
  const roleOf = (id: string) => (profiles ?? []).find((p) => p.id === id)?.role_id ?? null;
  const actorRoleId = roleOf(user.id);
  const actorRank = actorRoleId ? rankByRole.get(actorRoleId) ?? null : null;

  const isSelf = user.id === targetId;
  if (!isSelf && !(profiles ?? []).some((p) => p.id === targetId)) {
    throw new RankGuardError("That person could not be found.");
  }
  if (!canActOn(actorRank, guardRank(roleOf(targetId), rankByRole), isSelf)) {
    throw new RankGuardError();
  }
  return { actorId: user.id };
}

/**
 * Checks, before an account is created, that the caller may give a new person
 * `roleId`: the same rule the database applies to the role update that
 * follows (rule (b): never a role senior to your own). Without this, Add
 * person would create the account, then fail on the role, and leave a
 * half-made account behind. A null roleId (no role) is always allowed.
 * Returns the caller's id for the audit row.
 */
export async function requireCanAssignRole(roleId: string | null): Promise<{ actorId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new RankGuardError("You must be signed in.");
  }
  if (!roleId) return { actorId: user.id };

  const [{ data: actor, error: actorError }, { data: roles, error: rolesError }] =
    await Promise.all([
      supabase.from("profiles").select("role_id").eq("id", user.id).maybeSingle(),
      supabase.from("roles").select("id, rank"),
    ]);
  if (actorError || rolesError) {
    throw new RankGuardError("Could not check rank. Try again.");
  }

  const rankByRole = new Map((roles ?? []).map((r) => [r.id, r.rank]));
  if (!rankByRole.has(roleId)) {
    throw new RankGuardError("That role could not be found.");
  }
  const roleRank = rankByRole.get(roleId) ?? null;
  const actorRank = actor?.role_id ? rankByRole.get(actor.role_id) ?? null : null;
  if (roleRank != null && (actorRank == null || roleRank < actorRank)) {
    throw new RankGuardError("You can't give someone a role above your own.");
  }
  return { actorId: user.id };
}
