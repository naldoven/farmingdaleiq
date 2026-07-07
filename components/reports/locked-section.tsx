import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shown in place of a report section the signed-in user's role can't see.
 * `reports.view` gets you into /reports at all, but several sections read
 * tables that are further permission-gated at the RLS layer (accountability
 * infractions, token ledger, reward claims, catering) -- this makes that
 * restriction visible instead of just silently rendering an empty table,
 * which would look like a bug ("no data") rather than "no access."
 */
export function LockedSection({ title, requires }: { title: string; requires: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have permission to view this section. Requires {requires}.
        </p>
      </CardContent>
    </Card>
  );
}
