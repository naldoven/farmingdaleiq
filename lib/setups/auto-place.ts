/**
 * Auto-place suggestions for the setup board (ARCHITECTURE.md "Setups &
 * Shifts": "setup_assignments... auto-place suggestions rank candidates by
 * position rating"). PLAN.md S3 brief: "call a lib interface
 * getPositionRating(user, position) stubbed to return null until S4
 * merges; wire-up happens in P2."
 *
 * `position_ratings` is owned by S4 (docs/agent-map.md), so this module
 * never queries that table directly. It depends only on the small
 * `PositionRatingLookup` interface below; P2's wiring agent swaps
 * `stubPositionRatingLookup` for a real implementation backed by S4's
 * table without this module (or its callers) changing shape.
 */

export interface PositionRatingLookup {
  /** Returns the person's current star rating (0-5) for a position, or null if unrated. */
  getPositionRating(userId: string, positionId: string): Promise<number | null>;
}

export const stubPositionRatingLookup: PositionRatingLookup = {
  // STUB for P2 wiring: always "unrated" until S4's position_ratings table
  // is available to read from here.
  async getPositionRating() {
    return null;
  },
};

export interface RatedCandidate {
  userId: string;
  rating: number | null;
}

/**
 * Ranks candidates for a position by rating, highest first. Unrated
 * candidates (null) sort after every rated candidate but keep their
 * relative input order (stable sort) so the fallback is deterministic
 * while every position rating is still a stub returning null.
 */
export async function rankCandidatesForPosition(
  candidateUserIds: string[],
  positionId: string,
  lookup: PositionRatingLookup = stubPositionRatingLookup,
): Promise<RatedCandidate[]> {
  const rated = await Promise.all(
    candidateUserIds.map(async (userId) => ({
      userId,
      rating: await lookup.getPositionRating(userId, positionId),
    })),
  );

  return rated
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      if (a.candidate.rating === b.candidate.rating) return a.index - b.index;
      if (a.candidate.rating === null) return 1;
      if (b.candidate.rating === null) return -1;
      return b.candidate.rating - a.candidate.rating;
    })
    .map(({ candidate }) => candidate);
}
