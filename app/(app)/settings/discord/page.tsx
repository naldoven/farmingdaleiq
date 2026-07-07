import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelForm } from "@/components/settings/channel-form";
import { ChannelList } from "@/components/settings/channel-list";
import { EventRouteTable } from "@/components/settings/event-route-table";
import { DISCORD_ROUTABLE_EVENT_KEYS } from "@/lib/discord/format";
import { requirePermission } from "@/lib/auth/permissions";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * /settings/discord (ARCHITECTURE.md page map: "Register channel webhooks,
 * map event routes, link members' Discord IDs").
 *
 * `discord.manage`-gated: this is the ONE page in the app that reads
 * `discord_channels` (never `webhook_url` — see actions.ts header for why
 * that column never reaches a Client Component). Individual members'
 * `profiles.discord_user_id` is edited on their People profile page
 * (app/(app)/people/[id]/page.tsx, owned by the People module) — this page
 * just links there rather than duplicating that form.
 */
export default async function DiscordSettingsPage() {
  await requirePermission("discord.manage");

  const admin = createServiceRoleClient();

  const [{ data: channels }, { data: routes }] = await Promise.all([
    admin
      .from("discord_channels")
      .select("id, name, purpose, active")
      .order("name"),
    admin
      .from("discord_event_routes")
      .select("event_key, channel_id, enabled"),
  ]);

  const routeByKey = new Map((routes ?? []).map((r) => [r.event_key, r]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Discord</h1>
        <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
          &larr; Settings
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>
            Each channel needs a Discord incoming webhook URL (Discord server settings
            &rarr; Integrations &rarr; Webhooks). Webhook URLs are never shown again after
            you save them.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ChannelForm />
          <ChannelList channels={channels ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event routing</CardTitle>
          <CardDescription>
            Which channel each event posts to. Accountability events (infraction issued,
            disciplinary action) only ever post a name, never point details — route them
            to a private leaders channel only if you want that at all.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventRouteTable
            eventKeys={DISCORD_ROUTABLE_EVENT_KEYS}
            channels={(channels ?? []).filter((c) => c.active)}
            routeByKey={Object.fromEntries(routeByKey)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discord IDs</CardTitle>
          <CardDescription>
            Members link their own Discord user ID for @mentions from their profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/people" className="text-sm text-primary hover:underline">
            Go to Roster &rarr;
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
