import { computeAverage } from "@/app/(app)/ratings/logic";

/** Pure helpers for the Station Grid (ARCHITECTURE.md "Trainee lifecycle" >
 * "Station grid"): "Each cell cycles Not started → In training → scored 1 to
 * 5 with the trainer's initials recorded." */

export type StationStatus = "not_started" | "in_training" | "scored";

export interface StationState {
  status: StationStatus;
  score: number | null;
}

/** Advances a cell one step through the cycle, wrapping 5 back to
 * Not started. */
export function cycleStation(current: StationState): StationState {
  if (current.status === "not_started") {
    return { status: "in_training", score: null };
  }
  if (current.status === "in_training") {
    return { status: "scored", score: 1 };
  }
  // scored: 1 -> 2 -> 3 -> 4 -> 5 -> not_started
  if (current.score === null || current.score >= 5) {
    return { status: "not_started", score: null };
  }
  return { status: "scored", score: current.score + 1 };
}

export function phaseAverage(scores: (number | null)[]): number | null {
  return computeAverage(scores.filter((s): s is number => s !== null));
}

export function completedCount(statuses: StationStatus[]): number {
  return statuses.filter((s) => s === "scored").length;
}

/** Roadmap is finished once every station has been scored at least once. */
export function isRoadmapComplete(totalStations: number, scoredCount: number): boolean {
  return totalStations > 0 && scoredCount === totalStations;
}
