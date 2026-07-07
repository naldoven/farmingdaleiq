import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RateCell } from "@/components/training/rate-cell";
import { ResolveRerateButton } from "@/components/training/resolve-rerate-button";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeAverage } from "@/app/(app)/ratings/logic";

/**
 * /ratings — skills matrix (people x positions, color-coded), rate/re-rate
 * flows, re-rate queue. ARCHITECTURE.md "Position Ratings".
 */
export default async function RatingsPage() {
  await requirePermission("ratings.view");
  const canRate = await hasPermission("ratings.rate");

  const supabase = await createClient();

  const [
    { data: profiles },
    { data: positions },
    { data: ratings },
    { data: rubrics },
    { data: rerates },
  ] = await Promise.all([
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
    supabase.from("positions").select("id, name, sort").order("sort"),
    supabase
      .from("position_ratings")
      .select("id, user_id, position_id, stars, rated_at")
      .eq("is_current", true),
    supabase.from("rating_rubrics").select("position_id, category_1, category_2, category_3, category_4"),
    supabase
      .from("rerate_prompts")
      .select("id, user_id, position_id, due_on")
      .is("resolved_at", null)
      .order("due_on"),
  ]);

  const people = profiles ?? [];
  const positionList = positions ?? [];
  const ratingByPair = new Map(
    (ratings ?? []).map((r) => [`${r.user_id}:${r.position_id}`, r]),
  );
  const rubricByPosition = new Map((rubrics ?? []).map((r) => [r.position_id, r]));
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const positionNameById = new Map(positionList.map((p) => [p.id, p.name]));

  const storeAverageByPosition = new Map<string, number | null>();
  for (const position of positionList) {
    const values = (ratings ?? [])
      .filter((r) => r.position_id === position.id)
      .map((r) => r.stars);
    storeAverageByPosition.set(position.id, computeAverage(values));
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Ratings</h1>
        <p className="text-sm text-muted-foreground">
          3.0+ = qualified. Blue = above store average, red = below.
        </p>
      </div>

      {(rerates ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Re-rate queue</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(rerates ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                <span>
                  {nameById.get(r.user_id ?? "") ?? "Unknown"} —{" "}
                  {positionNameById.get(r.position_id ?? "") ?? "Unknown position"}{" "}
                  <span className="text-muted-foreground">(due {r.due_on})</span>
                </span>
                {canRate && <ResolveRerateButton id={r.id} />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Skills matrix</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card">Name</TableHead>
                {positionList.map((position) => (
                  <TableHead key={position.id} className="whitespace-nowrap text-center">
                    {position.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => {
                const personRatings = positionList
                  .map((p) => ratingByPair.get(`${person.id}:${p.id}`)?.stars ?? null)
                  .filter((v): v is number => v !== null);
                const overall = computeAverage(personRatings);

                return (
                  <TableRow key={person.id}>
                    <TableCell className="sticky left-0 whitespace-nowrap bg-card font-medium">
                      {person.name}
                      {overall !== null && (
                        <Badge variant="outline" className="ml-2">
                          avg {overall.toFixed(1)}
                        </Badge>
                      )}
                    </TableCell>
                    {positionList.map((position) => {
                      const rating = ratingByPair.get(`${person.id}:${position.id}`);
                      const rubric = rubricByPosition.get(position.id) ?? null;
                      return (
                        <TableCell key={position.id} className="text-center">
                          <RateCell
                            userId={person.id}
                            positionId={position.id}
                            personName={person.name}
                            positionName={position.name}
                            stars={rating?.stars ?? null}
                            storeAverage={storeAverageByPosition.get(position.id) ?? null}
                            rubric={rubric}
                            canRate={canRate}
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
              {people.length === 0 && (
                <TableRow>
                  <TableCell colSpan={positionList.length + 1} className="text-center text-muted-foreground">
                    No active people yet.
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
