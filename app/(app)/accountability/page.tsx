import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountabilitySettingsForm } from "@/components/accountability/settings-form";
import { AcknowledgeButton } from "@/components/accountability/acknowledge-button";
import {
  DeleteDisciplinaryActionTypeButton,
  DeleteInfractionTypeButton,
} from "@/components/accountability/delete-row-button";
import { DisciplinaryTypeCreateForm } from "@/components/accountability/disciplinary-type-form";
import { InfractionTypeCreateForm } from "@/components/accountability/infraction-type-form";
import { IssueInfractionForm } from "@/components/accountability/issue-infraction-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeActivePoints } from "@/app/(app)/accountability/logic";
import { fetchMyInfractions } from "@/app/(app)/accountability/queries";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

/**
 * /accountability — ARCHITECTURE.md page map: "Issue infractions; my record;
 * admin: types, ladder, period settings." Every section below is gated by
 * the same permission its writes require (accountability.view_own/
 * .issue/.manage), matching what RLS independently enforces.
 */
export default async function AccountabilityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [canViewOwn, canIssue, canManage] = await Promise.all([
    hasPermission("accountability.view_own"),
    hasPermission("accountability.issue"),
    hasPermission("accountability.manage"),
  ]);

  const now = new Date();

  // My record -----------------------------------------------------------
  let myPoints = 0;
  let myInfractions: Awaited<ReturnType<typeof fetchMyInfractions>>["data"] = [];
  let myActions: { id: string; type_id: string; status: string; triggered_at: string; acknowledged_at: string | null }[] = [];
  let disciplinaryTypeNameById = new Map<string, string>();

  if (canViewOwn && user) {
    const [{ data: infractions }, { data: actions }, { data: types }] = await Promise.all([
      fetchMyInfractions(supabase),
      supabase
        .from("disciplinary_actions")
        .select("id, type_id, status, triggered_at, acknowledged_at")
        .eq("user_id", user.id)
        .order("triggered_at", { ascending: false }),
      supabase.from("disciplinary_action_types").select("id, name"),
    ]);
    myInfractions = infractions;
    myPoints = computeActivePoints(infractions, now);
    myActions = actions ?? [];
    disciplinaryTypeNameById = new Map((types ?? []).map((t) => [t.id, t.name]));
  }

  // Issue infraction ------------------------------------------------------
  let people: { id: string; name: string }[] = [];
  let infractionTypeOptions: { id: string; name: string; points: number }[] = [];
  if (canIssue) {
    const [{ data: profiles }, { data: types }] = await Promise.all([
      supabase.from("profiles").select("id, name").eq("active", true).order("name"),
      supabase
        .from("infraction_types")
        .select("id, name, points")
        .eq("active", true)
        .order("name"),
    ]);
    people = (profiles ?? []).filter((p) => p.id !== user?.id);
    infractionTypeOptions = types ?? [];
  }

  // Admin -------------------------------------------------------------------
  let allInfractionTypes: { id: string; name: string; points: number; active: boolean }[] = [];
  let allDisciplinaryTypes: { id: string; name: string; threshold_points: number; sort: number }[] = [];
  let settings: { id: string; period_kind: string; period_days: number } | null = null;
  let storeLog: {
    id: string;
    user_id: string;
    type_id: string;
    points: number;
    issued_at: string;
    issued_by: string | null;
  }[] = [];
  let profileNameById = new Map<string, string>();

  if (canManage) {
    const [
      { data: types },
      { data: ladder },
      { data: settingsRow },
      { data: log },
      { data: allProfiles },
    ] = await Promise.all([
      supabase.from("infraction_types").select("id, name, points, active").order("name"),
      supabase
        .from("disciplinary_action_types")
        .select("id, name, threshold_points, sort")
        .order("sort"),
      supabase.from("accountability_settings").select("id, period_kind, period_days").maybeSingle(),
      supabase
        .from("infractions")
        .select("id, user_id, type_id, points, issued_at, issued_by")
        .order("issued_at", { ascending: false })
        .limit(50),
      supabase.from("profiles").select("id, name"),
    ]);
    allInfractionTypes = types ?? [];
    allDisciplinaryTypes = ladder ?? [];
    settings = settingsRow ?? null;
    storeLog = log ?? [];
    profileNameById = new Map((allProfiles ?? []).map((p) => [p.id, p.name]));
  }

  // Only rendered inside the canManage block below, which is the only place
  // allInfractionTypes is ever populated (and it always includes every type,
  // active or not).
  const infractionTypeNameById = new Map(allInfractionTypes.map((t) => [t.id, t.name]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Accountability</h1>
        <p className="text-sm text-muted-foreground">
          Infractions, disciplinary actions, and your own record.
        </p>
      </div>

      {canViewOwn && (
        <Card>
          <CardHeader>
            <CardTitle>My record</CardTitle>
            <CardDescription>
              Active points: <span className="font-semibold text-foreground">{myPoints}</span>.
              You never see who issued an infraction, only its points and note.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myInfractions.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.type_name}</TableCell>
                    <TableCell>{i.points}</TableCell>
                    <TableCell>{formatDate(i.issued_at)}</TableCell>
                    <TableCell>{formatDate(i.expires_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{i.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {myInfractions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No infractions on record.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {myActions.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Disciplinary actions</h3>
                {myActions.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {disciplinaryTypeNameById.get(a.type_id) ?? "Disciplinary action"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Triggered {formatDate(a.triggered_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={a.status === "pending" ? "warning" : "outline"}>
                        {a.status}
                      </Badge>
                      {a.status === "pending" && <AcknowledgeButton id={a.id} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {canIssue && (
        <Card>
          <CardHeader>
            <CardTitle>Issue an infraction</CardTitle>
            <CardDescription>The recipient will see the points, not you.</CardDescription>
          </CardHeader>
          <CardContent>
            {people.length === 0 || infractionTypeOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No people or infraction types available yet.
              </p>
            ) : (
              <IssueInfractionForm people={people} types={infractionTypeOptions} />
            )}
          </CardContent>
        </Card>
      )}

      {canManage && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Accountability period</CardTitle>
              <CardDescription>
                Rolling: points expire N days after issuance. Fixed: everyone&apos;s points
                reset together on a shared window.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settings ? (
                <AccountabilitySettingsForm
                  id={settings.id}
                  periodKind={settings.period_kind}
                  periodDays={settings.period_days}
                />
              ) : (
                <p className="text-sm text-muted-foreground">No settings row found.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Infraction types</CardTitle>
              <CardDescription>Each type is worth a number of points.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <InfractionTypeCreateForm />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allInfractionTypes.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.points}</TableCell>
                      <TableCell>
                        <Badge variant={t.active ? "success" : "outline"}>
                          {t.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteInfractionTypeButton id={t.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {allInfractionTypes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No infraction types yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Disciplinary ladder</CardTitle>
              <CardDescription>
                An action fires automatically when active points cross a threshold.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <DisciplinaryTypeCreateForm nextSort={allDisciplinaryTypes.length + 1} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allDisciplinaryTypes.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.threshold_points} pts</TableCell>
                      <TableCell className="text-right">
                        <DeleteDisciplinaryActionTypeButton id={t.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {allDisciplinaryTypes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No ladder rungs yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent infractions (store-wide)</CardTitle>
              <CardDescription>Admin audit view — includes who issued it.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Issued by</TableHead>
                    <TableHead>Issued</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storeLog.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{profileNameById.get(i.user_id) ?? "—"}</TableCell>
                      <TableCell>{infractionTypeNameById.get(i.type_id) ?? "—"}</TableCell>
                      <TableCell>{i.points}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {i.issued_by ? (profileNameById.get(i.issued_by) ?? "—") : "—"}
                      </TableCell>
                      <TableCell>{formatDate(i.issued_at)}</TableCell>
                    </TableRow>
                  ))}
                  {storeLog.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No infractions issued yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
