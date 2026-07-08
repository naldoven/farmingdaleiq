import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BootstrapAdminButton } from "@/components/people/bootstrap-admin-button";
import { getBootstrapEligibility } from "@/app/(app)/people/actions";

/**
 * /people/bootstrap — one-time first-admin claim page
 * (KITCHENIQ-PARITY-AUDIT.md "People & Teams" [HIGH]: no seed creates an
 * initial admin, and inviteUser requires people.manage that nobody holds on
 * a fresh store). Reachable by anyone signed in (the (app) layout already
 * requires a session); the button only renders while no admin exists yet.
 */
export default async function BootstrapAdminPage() {
  const eligibility = await getBootstrapEligibility();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/people" className="text-sm text-muted-foreground hover:underline">
          &larr; Roster
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Claim admin access</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {eligibility.eligible ? (
            <>
              <p className="text-sm text-muted-foreground">
                No one at this store holds admin access yet. Claiming it makes
                your account the Location Manager so you can invite the rest
                of the team and assign roles.
              </p>
              <BootstrapAdminButton />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {eligibility.reason ??
                "An admin already exists for this store. Ask them to invite you or assign your role."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
