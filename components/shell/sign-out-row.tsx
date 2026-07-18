"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { ListRow } from "@/components/mobile";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign-out affordance for the /menu hub (F-AUTH-2). The desktop sidebar has its
 * own SignOutButton, but that sidebar is `hidden md:flex`, so on phones the
 * Menu tab is the only place every role can reach sign-out. Rendered as a
 * standard menu row (not permission-gated: everyone can sign themselves out).
 */
export function SignOutRow() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <ListRow
      title={isPending ? "Signing out..." : "Sign out"}
      icon={LogOut}
      iconTone="danger"
      trailing={false}
      className="rounded-2xl border border-line bg-card"
      onClick={() => {
        if (isPending) return;
        startTransition(async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push("/login");
          router.refresh();
        });
      }}
    />
  );
}
