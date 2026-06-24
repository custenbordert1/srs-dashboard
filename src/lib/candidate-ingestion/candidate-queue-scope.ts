import { isAppliedDateInRange, type BreezyCandidate } from "@/lib/breezy-api";

export type CandidateQueueScope = "mtd" | "all" | "historical";

export const CANDIDATE_QUEUE_SCOPE_LABELS: Record<CandidateQueueScope, string> = {
  mtd: "MTD applicants",
  all: "All ingested",
  historical: "Historical applicants",
};

export function currentMtdDateRange(reference = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function isMtdApplicant(
  candidate: Pick<BreezyCandidate, "appliedDate">,
  range = currentMtdDateRange(),
): boolean {
  return isAppliedDateInRange(candidate.appliedDate, range.start, range.end);
}

export function isHistoricalApplicant(
  candidate: Pick<BreezyCandidate, "appliedDate">,
  range = currentMtdDateRange(),
): boolean {
  return !isMtdApplicant(candidate, range);
}

export function filterCandidatesByQueueScope<T extends Pick<BreezyCandidate, "appliedDate">>(
  candidates: T[],
  scope: CandidateQueueScope,
  range = currentMtdDateRange(),
): T[] {
  if (scope === "all") return candidates;
  if (scope === "mtd") {
    return candidates.filter((candidate) => isMtdApplicant(candidate, range));
  }
  return candidates.filter((candidate) => isHistoricalApplicant(candidate, range));
}

export function candidateQueueScopeHint(scope: CandidateQueueScope): string | null {
  if (scope === "mtd") {
    return "Showing current-month applicants — owner and automation metrics align with P62/P63/P64 coverage.";
  }
  if (scope === "all") {
    return "Showing all ingested applicants. Historical rows outside the MTD automation window may remain unassigned by design.";
  }
  return "Showing historical applicants outside the current MTD automation window. These rows are not included in MTD P62/P63/P64 coverage.";
}
