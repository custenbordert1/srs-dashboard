import type {
  P199QueueFilterState,
  P199QueueSortId,
  P199SortableColumn,
} from "@/lib/p199-candidate-queue-ux/types";
import { matchesDaysSinceAppliedBucket } from "@/lib/p199-candidate-queue-ux/days-since-applied";

export type P199QueueCandidate = {
  candidateId: string;
  state: string;
  city: string;
  appliedDate: string;
  assignedRecruiter: string;
  aiNumericScore: number;
  /** Preferred confidence signal for sort/display. */
  confidence: number | null;
  /** Nearby mapped jobs count. */
  nearbyJobCount: number;
  /** Distance to nearest job/work in miles when known. */
  distanceMiles: number | null;
};

function normalizeState(raw: string): string {
  return raw.trim().toUpperCase();
}

export function matchesP199QueueFilters(
  candidate: P199QueueCandidate,
  filters: Pick<P199QueueFilterState, "states" | "daysSinceApplied">,
  nowMs = Date.now(),
): boolean {
  if (filters.states.length > 0) {
    const st = normalizeState(candidate.state);
    if (!filters.states.some((s) => normalizeState(s) === st)) return false;
  }
  if (!matchesDaysSinceAppliedBucket(candidate.appliedDate, filters.daysSinceApplied, nowMs)) {
    return false;
  }
  return true;
}

function appliedTs(raw: string): number {
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function confidenceValue(c: P199QueueCandidate): number {
  if (typeof c.confidence === "number" && Number.isFinite(c.confidence)) return c.confidence;
  return c.aiNumericScore;
}

function distanceValue(c: P199QueueCandidate): number {
  if (typeof c.distanceMiles === "number" && Number.isFinite(c.distanceMiles)) return c.distanceMiles;
  // Prefer candidates with nearby jobs; unknown distance sorts last for "nearest".
  if (c.nearbyJobCount > 0) return 9998;
  return 9999;
}

export function resolveSortFromHeader(
  column: P199SortableColumn,
  direction: "asc" | "desc",
): P199QueueSortId {
  switch (column) {
    case "applied":
    case "age":
      return direction === "asc" ? "oldest_applied" : "newest_applied";
    case "confidence":
      return direction === "asc" ? "lowest_ai" : "confidence";
    case "nearby":
      return "nearest_jobs";
    case "state":
    case "city":
    case "owner":
      return direction === "asc" ? "oldest_applied" : "newest_applied";
    default:
      return "newest_applied";
  }
}

function compareText(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base" });
}

export function sortP199QueueCandidates<T extends P199QueueCandidate>(
  rows: T[],
  filters: Pick<P199QueueFilterState, "sort" | "headerColumn" | "headerDirection">,
): T[] {
  const sorted = [...rows];
  const { sort, headerColumn, headerDirection } = filters;

  sorted.sort((a, b) => {
    if (headerColumn === "state") {
      const cmp = compareText(a.state, b.state);
      return headerDirection === "asc" ? cmp : -cmp;
    }
    if (headerColumn === "city") {
      const cmp = compareText(a.city, b.city);
      return headerDirection === "asc" ? cmp : -cmp;
    }
    if (headerColumn === "owner") {
      const cmp = compareText(a.assignedRecruiter || "Unassigned", b.assignedRecruiter || "Unassigned");
      return headerDirection === "asc" ? cmp : -cmp;
    }

    switch (sort) {
      case "newest_applied":
        return appliedTs(b.appliedDate) - appliedTs(a.appliedDate);
      case "oldest_applied":
        return appliedTs(a.appliedDate) - appliedTs(b.appliedDate);
      case "highest_ai":
        return b.aiNumericScore - a.aiNumericScore;
      case "lowest_ai":
        return a.aiNumericScore - b.aiNumericScore;
      case "nearest_jobs":
        return distanceValue(a) - distanceValue(b) || b.nearbyJobCount - a.nearbyJobCount;
      case "confidence":
        return confidenceValue(b) - confidenceValue(a);
      default:
        return appliedTs(b.appliedDate) - appliedTs(a.appliedDate);
    }
  });

  return sorted;
}

export function applyP199QueueFilterAndSort<T extends P199QueueCandidate>(
  rows: T[],
  filters: P199QueueFilterState,
  nowMs = Date.now(),
): T[] {
  const filtered = rows.filter((row) => matchesP199QueueFilters(row, filters, nowMs));
  return sortP199QueueCandidates(filtered, filters);
}

export function confidenceForQueueRow(input: {
  actionConfidence?: number | null;
  recruiterAssignmentConfidence?: number | null;
  progressionConfidence?: number | null;
  aiNumericScore?: number | null;
}): number | null {
  for (const value of [
    input.actionConfidence,
    input.recruiterAssignmentConfidence,
    input.progressionConfidence,
    input.aiNumericScore,
  ]) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
