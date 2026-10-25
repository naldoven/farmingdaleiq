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
