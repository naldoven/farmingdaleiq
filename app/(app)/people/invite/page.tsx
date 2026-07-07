import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm } from "@/components/people/invite-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Invite/create-user page (PLAN.md P0 #6). Gated in the UI by people.manage;
 * the real enforcement is `requirePermission("people.manage")` inside the
 * `inviteUser` server action (app/(app)/people/actions.ts).
 */
export default async function InvitePage() {
  const canManage = await hasPermission("people.manage");
  if (!canManage) {
    redirect("/people");
  }

  const supabase = await createClient();
  const { data: roles } = await supabase.from("roles").select("id, name, rank").order("rank");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <Link href="/people" className="text-sm text-muted-foreground hover:underline">
        &larr; Roster
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Invite a person</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteForm roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))} />
        </CardContent>
      </Card>
    </div>
  );
}
