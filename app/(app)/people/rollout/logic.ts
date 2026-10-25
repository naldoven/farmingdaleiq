import { isDiscordUserId } from "@/lib/discord/user-id";
import { STORE_TIME_ZONE, formatStoreDate } from "@/lib/time";

/**
 * Pure logic for the Rollout screen (/people/rollout). No I/O: the page reads
 * the rows and passes plain arrays in, so every rule here is unit-testable.
 */

export interface RolloutRow {
  id: string;
  name: string;
  roleName: string | null;
  active: boolean;
  signedIn: boolean;
  lastSeenAt: string | null;
  hasDiscordId: boolean;
  pushOptedIn: boolean;
}

export interface RolloutInput {
  profiles: { id: string; name: string; role_id: string | null; active: boolean }[];
  roleNameById: Map<string, string>;
  privateRows: { profile_id: string; discord_user_id: string | null }[];
  /** user_id of every push_subscriptions row. Duplicates (many devices) are fine. */
  pushUserIds: string[];
  authUsers: { id: string; last_sign_in_at: string | null }[];
}

export function buildRolloutRows(input: RolloutInput): RolloutRow[] {
  const discordByProfile = new Map(
    input.privateRows.map((row) => [row.profile_id, row.discord_user_id]),
  );
  const pushUsers = new Set(input.pushUserIds);
  const lastSignInByUser = new Map(
    input.authUsers.map((user) => [user.id, user.last_sign_in_at]),
  );

  return input.profiles
    .map((profile): RolloutRow => {
      const lastSeenAt = lastSignInByUser.get(profile.id) ?? null;
      return {
        id: profile.id,
        name: profile.name,
        roleName: profile.role_id ? (input.roleNameById.get(profile.role_id) ?? null) : null,
        active: profile.active,
        // A stored username is not a link: Discord rejects a `<@name>` ping,
        // so only a numeric id counts (lib/discord/user-id.ts).
        signedIn: lastSeenAt !== null,
        lastSeenAt,
        hasDiscordId: isDiscordUserId(discordByProfile.get(profile.id)),
        pushOptedIn: pushUsers.has(profile.id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface RolloutSummary {
  total: number;
  signedIn: number;
  discordLinked: number;
  pushOptedIn: number;
}

/** Counts active people only. Inactive accounts never gate the rollout. */
export function summarizeRollout(rows: RolloutRow[]): RolloutSummary {
  const active = rows.filter((row) => row.active);
  return {
    total: active.length,
    signedIn: active.filter((row) => row.signedIn).length,
    discordLinked: active.filter((row) => row.hasDiscordId).length,
    pushOptedIn: active.filter((row) => row.pushOptedIn).length,
  };
}

export interface EmailComparison {
  matched: number;
  missing: string[];
  invalid: string[];
}

// Loose on purpose: something@something.tld with no spaces. The invite flow
// and Supabase do the strict check; this only separates typos from addresses.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function compareEmailList(pasted: string, knownEmails: string[]): EmailComparison {
  const known = new Set(knownEmails.map((email) => email.trim().toLowerCase()));
  const seen = new Set<string>();
  const missing: string[] = [];
  const invalid: string[] = [];
  let matched = 0;

  for (const piece of pasted.split(/[\s,;]+/)) {
    // "Name <a@b.com>" pastes leave angle brackets or quotes on the address.
    const entry = piece.trim().replace(/^[<"']+|[>"']+$/g, "").toLowerCase();
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);

    if (!EMAIL_SHAPE.test(entry)) {
      invalid.push(entry);
    } else if (known.has(entry)) {
      matched += 1;
    } else {
      missing.push(entry);
    }
  }

  return { matched, missing, invalid };
}

const DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Whole calendar days since 1970 for an instant, as the store's wall clock sees it. */
function storeDayNumber(date: Date): number {
  const [year, month, day] = DAY_FORMATTER.format(date).split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function formatLastSeen(iso: string | null, now: Date): string {
  if (!iso) return "Never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never";

  // Calendar days in store time, not 24-hour blocks: 11pm last night is
  // "Yesterday" at 8am, even though only nine hours passed.
  const days = storeDayNumber(now) - storeDayNumber(date);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 30) return `${days} days ago`;
  return formatStoreDate(date);
}
