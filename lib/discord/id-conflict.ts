/**
 * One Discord account belongs to one person. The database enforces it with the
 * partial unique index profiles_private_discord_user_id_uq (migration
 * 20261025020000), so a save that loses a race, or a manager typing an ID that
 * is already on another profile, comes back from Postgres as SQLSTATE 23505.
 * Both save paths (the first-login link and the People profile edit) turn that
 * into the same plain sentence instead of showing the raw constraint text.
 */
export const DISCORD_ID_TAKEN_MESSAGE = "That Discord ID is already linked to another person.";

const UNIQUE_VIOLATION_SQLSTATE = "23505";

export function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === UNIQUE_VIOLATION_SQLSTATE;
}
