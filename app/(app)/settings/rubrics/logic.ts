import type { RubricPositionRow } from "@/components/settings/rubrics-editor";

export interface RubricLike {
  position_id: string | null;
  category_1: string | null;
  category_2: string | null;
  category_3: string | null;
  category_4: string | null;
}

/**
 * Joins rateable positions with their rubric row (if any) and group name.
 * A position with no rubric row, or a row whose four categories are all
 * blank, is quick-rate: that is the same test components/training/
 * rate-cell.tsx applies when it picks which rating form to open.
 */
export function buildRubricRows(
  positions: readonly { id: string; name: string; group_id: string | null }[],
  groups: readonly { id: string; name: string }[],
  rubrics: readonly RubricLike[],
): RubricPositionRow[] {
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const rubricByPosition = new Map<string, RubricLike>();
  for (const rubric of rubrics) {
    if (rubric.position_id) rubricByPosition.set(rubric.position_id, rubric);
  }
  return positions.map((p) => {
    const rubric = rubricByPosition.get(p.id);
    return {
      id: p.id,
      name: p.name,
      groupName: p.group_id ? (groupNameById.get(p.group_id) ?? null) : null,
      categories: [
        rubric?.category_1 ?? "",
        rubric?.category_2 ?? "",
        rubric?.category_3 ?? "",
        rubric?.category_4 ?? "",
      ],
    };
  });
}
