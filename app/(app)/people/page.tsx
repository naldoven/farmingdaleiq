import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BadgesPlaceholder } from "@/components/people/badges-placeholder";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * /people roster — ARCHITECTURE.md page map: "Roster, profiles, roles &
 * permissions, teams." Reads are gated by people.view, which every seeded
 * role holds (supabase/migrations/20260707001900_seed_store_config.sql), so
 * this mirrors the RLS reality (profiles_select_store_member: any active
 * store member can see the roster) rather than actually restricting anyone
 * today. Writes (edit/role/teams/invite) require people.manage/teams.manage
 * and are enforced in the server actions, not here.
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; active?: string }>;
}) {
  await requirePermission("people.view");
  const canManage = await hasPermission("people.manage");
  const { q, active } = await searchParams;

  const supabase = await createClient();

  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email, role_id, active")
      .order("name"),
    supabase.from("roles").select("id, name, rank").order("rank"),
  ]);

  const roleNameById = new Map((roles ?? []).map((r) => [r.id, r.name]));

  const filtered = (profiles ?? []).filter((p) => {
    if (active === "active" && !p.active) return false;
    if (active === "inactive" && p.active) return false;
    if (q) {
      const needle = q.toLowerCase();
      if (
        !p.name.toLowerCase().includes(needle) &&
        !p.email.toLowerCase().includes(needle)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Roster</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/people/teams">Teams</Link>
          </Button>
          {canManage && (
            <Button asChild>
              <Link href="/people/invite">Invite person</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search &amp; filter</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-center gap-2" method="get">
            <Input
              name="q"
              placeholder="Search name or email"
              defaultValue={q ?? ""}
              className="max-w-xs"
            />
            <select
              name="active"
              defaultValue={active ?? ""}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
            >
              <option value="">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Badges</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell>
                    <Link
                      href={`/people/${profile.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {profile.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{profile.email}</TableCell>
                  <TableCell>
                    {profile.role_id ? (roleNameById.get(profile.role_id) ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={profile.active ? "success" : "outline"}>
                      {profile.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <BadgesPlaceholder />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No one matches this search.
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
