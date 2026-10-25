import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { SectionCard, StatTile, StatusBadge, type StatTone } from "@/components/mobile";
import { PersonRow } from "@/components/people/person-row";
import { RolloutEmailCheck } from "@/components/people/rollout-email-check";
import { requirePermission } from "@/lib/auth/permissions";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import {
  buildRolloutRows,
  formatLastSeen,
  summarizeRollout,
} from "@/app/(app)/people/rollout/logic";

/**
 * /people/rollout: who has actually signed in, linked Discord, and turned on
 * push. A manager's checklist for getting every leader set up, since all
 * notifications go through Discord. Read-only; the fix for a missing Discord
 * ID is the person's profile page (each row links there).
 */
export const metadata = { title: "Rollout" };

function tone(count: number, total: number): StatTone {
  return total > 0 && count === total ? "success" : "warning";
}

export default async function RolloutPage() {
  await requirePermission("people.manage");

  const supabase = await createClient();

  // Service-role reads, and why that is acceptable here: the page is already
  // gated by people.manage above; profiles_private is locked from PostgREST;
  // and push_subscriptions RLS only exposes a person's own rows, so a manager
  // could never see the whole team's opt-in through the normal client. Only
  // booleans derived from these rows (has a Discord ID, has a push device)
  // reach the client. No email or Discord ID is ever rendered on this page.
  const admin = createServiceRoleClient();

  const [
    { data: profiles },
    { data: roles },
    { data: privateRows },
    { data: pushRows },
    authResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id, name, role_id, active").order("name"),
    supabase.from("roles").select("id, name"),
    admin.from("profiles_private").select("profile_id, discord_user_id"),
    admin.from("push_subscriptions").select("user_id"),
    // A failed lookup must not take the page down: the rest of the screen is
    // still useful, so it degrades to "unknown" with a one-line notice.
    admin.auth.admin
      .listUsers({ page: 1, perPage: 200 })
      .then((res) => res)
      .catch(() => ({ data: null, error: new Error("listUsers failed") })),
  ]);

  const authKnown = !authResult.error && authResult.data !== null;
  const authUsers = authKnown
    ? authResult.data.users.map((user) => ({
        id: user.id,
        last_sign_in_at: user.last_sign_in_at ?? null,
      }))
    : [];

  const rows = buildRolloutRows({
    profiles: profiles ?? [],
    roleNameById: new Map((roles ?? []).map((r) => [r.id, r.name])),
    privateRows: privateRows ?? [],
    pushUserIds: (pushRows ?? []).map((r) => r.user_id),
    authUsers,
  });
  const summary = summarizeRollout(rows);
  const activeRows = rows.filter((row) => row.active);
  const inactiveCount = rows.length - activeRows.length;
  const now = new Date();

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <Link href="/people" className="text-[13px] font-semibold text-accent">
        &larr; Roster
      </Link>

      {!authKnown && (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">
          Sign-in data is unavailable right now, so sign-in status is hidden.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Signed in"
          value={authKnown ? `${summary.signedIn}/${summary.total}` : "?"}
          tone={authKnown ? tone(summary.signedIn, summary.total) : "neutral"}
        />
        <StatTile
          label="Discord linked"
          value={`${summary.discordLinked}/${summary.total}`}
          tone={tone(summary.discordLinked, summary.total)}
        />
        <StatTile
          label="Push on"
          value={`${summary.pushOptedIn}/${summary.total}`}
          tone={tone(summary.pushOptedIn, summary.total)}
        />
      </div>

      <SectionCard flush>
        {activeRows.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-ink">
            No active people yet.
          </p>
        ) : (
          <div className="divide-y divide-line">
            {activeRows.map((row) => (
              <PersonRow
                key={row.id}
                href={`/people/${row.id}`}
                name={row.name}
                description={row.roleName ?? "No role"}
                meta={
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap gap-1">
                      {authKnown && (
                        <StatusBadge tone={row.signedIn ? "success" : "warning"}>
                          {row.signedIn ? "Signed in" : "Not yet"}
                        </StatusBadge>
                      )}
                      <StatusBadge tone={row.hasDiscordId ? "success" : "warning"}>
                        {row.hasDiscordId ? "Discord" : "No ID"}
                      </StatusBadge>
                      <StatusBadge tone={row.pushOptedIn ? "success" : "neutral"}>
                        {row.pushOptedIn ? "Push" : "No push"}
                      </StatusBadge>
                    </span>
                    {authKnown && (
                      <span className="text-[12px] text-muted-ink">
                        Last seen: {formatLastSeen(row.lastSeenAt, now)}
                      </span>
                    )}
                  </span>
                }
                trailing={
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-ink" aria-hidden="true" />
                }
              />
            ))}
          </div>
        )}
      </SectionCard>

      {inactiveCount > 0 && (
        <p className="px-1 text-[13px] text-muted-ink">{inactiveCount} inactive not shown</p>
      )}

      <SectionCard title="Check an email list">
        <RolloutEmailCheck />
      </SectionCard>
    </div>
  );
}
