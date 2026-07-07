import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TeamCreateForm } from "@/components/people/team-create-form";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /people/teams — team roster CRUD (ARCHITECTURE.md "/people" page-map row:
 * "...teams"). Reads rely on RLS (teams_select_authenticated: any signed-in
 * store member); writes are gated by teams.manage in
 * app/(app)/people/teams/actions.ts.
 */
export default async function TeamsPage() {
  const canManage = await hasPermission("teams.manage");
  const supabase = await createClient();

  const [{ data: teams }, { data: memberships }] = await Promise.all([
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("team_members").select("team_id"),
  ]);

  const memberCountByTeam = new Map<string, number>();
  for (const m of memberships ?? []) {
    memberCountByTeam.set(m.team_id, (memberCountByTeam.get(m.team_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Teams</h1>
        <Link href="/people" className="text-sm text-muted-foreground hover:underline">
          &larr; Roster
        </Link>
      </div>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Create a team</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamCreateForm />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(teams ?? []).map((team) => (
                <TableRow key={team.id}>
                  <TableCell>
                    <Link
                      href={`/people/teams/${team.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {team.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {memberCountByTeam.get(team.id) ?? 0}
                  </TableCell>
                </TableRow>
              ))}
              {(teams ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No teams yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
