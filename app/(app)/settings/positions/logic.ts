/**
 * Pure helpers for the /settings/positions editor. No React, no database,
 * so the grouping and ordering rules are unit-testable on their own.
 */

export interface PositionGroupLike {
  id: string;
  name: string;
  sort: number;
}

export interface PositionLike {
  id: string;
  group_id: string | null;
  name: string;
  sort: number;
  is_rateable: boolean;
}

export interface GroupedPositions<G extends PositionGroupLike, P extends PositionLike> {
  group: G;
  positions: P[];
}

function byGroupSortThenName<P extends PositionLike>(a: P, b: P): number {
  return a.sort - b.sort || a.name.localeCompare(b.name);
}

/**
 * Buckets positions under their group in group sort order, positions by
 * sort then name within each. Ungrouped positions come back separately so
 * the editor can show them in a dashed "Ungrouped" card at the bottom, the
 * way the dormant Setups editor did.
 */
export function groupPositions<G extends PositionGroupLike, P extends PositionLike>(
  groups: readonly G[],
  positions: readonly P[],
): { grouped: GroupedPositions<G, P>[]; ungrouped: P[] } {
  const sortedGroups = [...groups].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const grouped = sortedGroups.map((group) => ({
    group,
    positions: positions.filter((p) => p.group_id === group.id).sort(byGroupSortThenName),
  }));
  const ungrouped = positions.filter((p) => p.group_id === null).sort(byGroupSortThenName);
  return { grouped, ungrouped };
}

/**
 * Moves one id up or down in an ordered list and returns the new order, or
 * the same list when the move would fall off either end. The caller sends
 * the whole list to reorderPositions so every row gets sort = index.
 */
export function moveInList(orderedIds: readonly string[], id: string, delta: -1 | 1): string[] {
  const index = orderedIds.indexOf(id);
  if (index === -1) return [...orderedIds];
  const target = index + delta;
  if (target < 0 || target >= orderedIds.length) return [...orderedIds];
  const next = [...orderedIds];
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row);
  return next;
}

/**
 * A position that backs an onboarding-roadmap station belongs to the
 * training module. The delete RPC refuses those (Postgres 23503), so the
 * editor labels them "Training station" up front instead of letting the
 * tap fail.
 */
export function trainingStationIds(
  roadmapStations: readonly { position_id: string | null }[],
): Set<string> {
  return new Set(roadmapStations.map((s) => s.position_id).filter((id): id is string => id !== null));
}

/**
 * The default Avondale list is a starting point for an empty store. Offer it
 * only when there are no positions at all. The earlier check looked for the
 * five seed group NAMES, so renaming a group brought the banner back and one
 * tap added all 19 positions a second time under duplicate groups.
 */
export function shouldOfferDefaultList(positionCount: number): boolean {
  return positionCount === 0;
}

/**
 * What a delete would erase for one or more positions, counted before the
 * delete RPC runs. The RPC (20260718010300) removes all of this without a
 * word, so the server action refuses first when any of it exists.
 */
export interface PositionHistory {
  /** position_ratings rows, current and past. */
  ratings: number;
  /** passport_enrollments on the position's passport: trainees who started it. */
  enrollments: number;
  /** passport_item_progress rows: stamped items, signatures, photos. */
  itemRecords: number;
}

export function hasHistory(history: PositionHistory): boolean {
  return history.ratings > 0 || history.enrollments > 0 || history.itemRecords > 0;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "12 ratings, 3 trainee passport enrollments, and 40 passport item records". */
export function describeHistory(history: PositionHistory): string {
  const parts: string[] = [];
  if (history.ratings > 0) parts.push(plural(history.ratings, "rating"));
  if (history.enrollments > 0) {
    parts.push(plural(history.enrollments, "trainee passport enrollment"));
  }
  if (history.itemRecords > 0) {
    parts.push(plural(history.itemRecords, "passport item record"));
  }
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * The plain refusal shown when a delete would erase history, or null when the
 * delete may go ahead. Points at the safe alternative: switching the position
 * off the Ratings matrix keeps every record.
 */
export function deleteRefusalMessage(
  target: { kind: "position" | "group"; name: string },
  history: PositionHistory,
): string | null {
  if (!hasHistory(history)) return null;
  const what = describeHistory(history);
  if (target.kind === "position") {
    return `Can't delete "${target.name}": it has ${what} (stamps, signatures, and photos count as item records). Deleting would erase them for good. Open the position and turn off "Show as a column on the Ratings matrix" to hide it instead.`;
  }
  return `Can't delete the group "${target.name}": its positions have ${what} (stamps, signatures, and photos count as item records). Deleting would erase them for good. Turn off "Show as a column on the Ratings matrix" on those positions to hide them instead.`;
}
