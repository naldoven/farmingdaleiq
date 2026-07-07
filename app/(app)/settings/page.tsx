import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth/permissions";

/**
 * /settings hub (ARCHITECTURE.md page map: "Day-parts, earning rules, store
 * settings"; docs/agent-map.md assigns the `/settings` route itself to S10).
 * Day-parts (core/S3) and token earning rules (S7) are owned by other
 * streams — this stream doesn't build editors for tables it doesn't own
 * (PLAN.md hard boundary). This page is the settings hub/nav: it links to
 * the section S10 does own (Discord) and flags the others as pending so the
 * route isn't a dead end while those streams land.
 */
export default async function SettingsPage() {
  await requirePermission("settings.manage");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Link href="/settings/discord">
        <Card className="transition-colors hover:bg-accent/50">
          <CardHeader>
            <CardTitle>Discord</CardTitle>
            <CardDescription>
              Register channel webhooks, map event routes, link members&apos; Discord IDs.
            </CardDescription>
          </CardHeader>
        </Card>
      </Link>

      <Card className="opacity-70">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Day-parts &amp; store settings</CardTitle>
            <Badge variant="outline">Setups module</Badge>
          </div>
          <CardDescription>Owned by the Setups &amp; shifts stream.</CardDescription>
        </CardHeader>
      </Card>

      <Card className="opacity-70">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Token earning rules</CardTitle>
            <Badge variant="outline">Tokens module</Badge>
          </div>
          <CardDescription>Owned by the Tokens, rewards &amp; feed stream.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
