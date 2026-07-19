import { RotateCcw } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListRow, SectionCard, StatusBadge } from "@/components/mobile";
import { RateCell } from "@/components/training/rate-cell";
import { ResolveRerateButton } from "@/components/training/resolve-rerate-button";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { computeAverage, rateableColumns } from "@/app/(app)/ratings/logic";

/**
 * /ratings — skills matrix (people x positions, color-coded), rate/re-rate
 * flows, re-rate queue. ARCHITECTURE.md "Position Ratings".
 *
 * Restyled to the KitchenIQ mobile design system (docs/DESIGN-SYSTEM.md):
 * the re-rate queue and matrix now sit in SectionCards with ListRow/
 * StatusBadge in place of the old shadcn Card/Badge shell. Same queries,
 * RateCell rating flow, and permission checks as before.
 */
export const metadata = { title: "Ratings" };

export default async function RatingsPage() {
  await requirePermission("ratings.view");
  const canRate = await hasPermission("ratings.rate");

  const supabase = await createClient();

  const [
    { data: profiles },
    { data: positions },
    { data: groups },
    { data: ratings },
    { data: rubrics },
    { data: rerates },
  ] = await Promise.all([
    supabase.from("profiles").select("id, name").eq("active", true).order("name"),
    // RAT1: only real skill stations. Onboarding-roadmap items (is_rateable
    // false, backfilled in 20260718010200_positions_is_rateable.sql) are not
    // rateable and must not pollute the matrix.
    supabase.from("positions").select("id, name, sort, group_id, is_rateable").eq("is_rateable", true).order("sort"),
    supabase.from("position_groups").select("id, name"),
    supabase
      .from("position_ratings")
      .select("id, user_id, position_id, stars, comment, rated_at")
      .eq("is_current", true),
    supabase.from("rating_rubrics").select("position_id, category_1, category_2, category_3, category_4"),
    supabase
      .from("rerate_prompts")
      .select("id, user_id, position_id, due_on")
      .is("resolved_at", null)
      .order("due_on"),
  ]);

  const people = profiles ?? [];
  const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name]));

  // RAT1: build the matrix columns from rateable positions, tagging any
  // duplicated station name so its position_group label disambiguates it.
  const columns = rateableColumns(
    (positions ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      is_rateable: p.is_rateable,
      groupName: p.group_id ? groupNameById.get(p.group_id) ?? null : null,
    })),
  );

  const ratingByPair = new Map(
    (ratings ?? []).map((r) => [`${r.user_id}:${r.position_id}`, r]),
  );
  const rubricByPosition = new Map((rubrics ?? []).map((r) => [r.position_id, r]));
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const positionNameById = new Map(columns.map((c) => [c.id, c.name]));

  const storeAverageByPosition = new Map<string, number | null>();
  for (const column of columns) {
    const values = (ratings ?? [])
      .filter((r) => r.position_id === column.id)
      .map((r) => r.stars);
    storeAverageByPosition.set(column.id, computeAverage(values));
  }

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-4">
      <p className="text-[13px] text-muted-ink">
        3.0+ = qualified. Blue = above store average, red = below.
      </p>

      {(rerates ?? []).length > 0 && (
        <SectionCard title="Re-rate Queue" flush>
          <div className="divide-y divide-line">
            {(rerates ?? []).map((r) => (
              <ListRow
                key={r.id}
                icon={RotateCcw}
                iconTone="warning"
                title={nameById.get(r.user_id ?? "") ?? "Unknown"}
                description={`${positionNameById.get(r.position_id ?? "") ?? "Unknown position"} · due ${r.due_on}`}
                trailing={canRate ? <ResolveRerateButton id={r.id} /> : undefined}
              />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Skills Matrix">
        <div className="-mx-4 overflow-x-auto px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card">Name</TableHead>
                {columns.map((column) => (
                  <TableHead key={column.id} className="whitespace-nowrap text-center">
                    <span className="block">{column.name}</span>
                    {column.showGroup && column.groupName && (
                      <span className="block text-[11px] font-normal text-muted-ink">{column.groupName}</span>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((person) => {
                const personRatings = columns
                  .map((c) => ratingByPair.get(`${person.id}:${c.id}`)?.stars ?? null)
                  .filter((v): v is number => v !== null);
                const overall = computeAverage(personRatings);

                return (
                  <TableRow key={person.id}>
                    <TableCell className="sticky left-0 whitespace-nowrap bg-card font-semibold text-ink">
                      <span className="flex items-center gap-2">
                        {person.name}
                        {overall !== null && <StatusBadge tone="neutral">avg {overall.toFixed(1)}</StatusBadge>}
                      </span>
                    </TableCell>
                    {columns.map((column) => {
                      const rating = ratingByPair.get(`${person.id}:${column.id}`);
                      const rubric = rubricByPosition.get(column.id) ?? null;
                      return (
                        <TableCell key={column.id} className="text-center">
                          <RateCell
                            userId={person.id}
                            positionId={column.id}
                            personName={person.name}
                            positionName={column.name}
                            stars={rating?.stars ?? null}
                            comment={rating?.comment ?? null}
                            storeAverage={storeAverageByPosition.get(column.id) ?? null}
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
                  <TableCell colSpan={columns.length + 1} className="text-center text-muted-ink">
                    No active people yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
