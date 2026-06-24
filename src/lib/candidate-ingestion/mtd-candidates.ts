import { isAppliedDateInRange, type BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import { listIngestedCandidates } from "@/lib/candidate-ingestion/ingestion-store";

export function currentMtdDateRange(reference = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function filterMtdCandidates(
  candidates: BreezyCandidate[],
  range = currentMtdDateRange(),
): BreezyCandidate[] {
  return candidates.filter((candidate) => isAppliedDateInRange(candidate.appliedDate, range.start, range.end));
}

export function listIngestedMtdCandidates(
  store: CandidateIngestionStoreFile,
  range = currentMtdDateRange(),
): BreezyCandidate[] {
  return filterMtdCandidates(listIngestedCandidates(store), range);
}
