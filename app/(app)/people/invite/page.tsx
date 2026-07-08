import Link from "next/link";
import { redirect } from "next/navigation";

import { SectionCard } from "@/components/mobile";
import { InviteForm } from "@/components/people/invite-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Invite/create-user page (PLAN.md P0 #6). Gated in the UI by people.manage;
 * the real enforcement is `requirePermission("people.manage")` inside the
 * `inviteUser` server action (app/(app)/people/actions.ts). Visual/layout
 * redesign onto the KitchenIQ mobile system (docs/DESIGN-SYSTEM.md): the
 * shadcn Card wrapper becomes a SectionCard; the form itself is unchanged.
 */
export default async function InvitePage() {
  const canManage = await hasPermission("people.manage");
  if (!canManage) {
    redirect("/people");
  }

  const supabase = await createClient();
  const { data: roles } = await supabase.from("roles").select("id, name, rank").order("rank");

  return (
    <div className="mx-auto flex max-w-[480px] flex-col gap-4">
      <Link href="/people" className="text-[13px] font-semibold text-accent">
        &larr; Roster
      </Link>
      <SectionCard title="Invite a person">
        <InviteForm roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name }))} />
      </SectionCard>
    </div>
  );
}
