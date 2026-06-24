import { isAppliedDateInRange, type BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import { listIngestedCandidates } from "@/lib/candidate-ingestion/ingestion-store";
import { currentMtdDateRange } from "@/lib/candidate-ingestion/candidate-queue-scope";

export { currentMtdDateRange } from "@/lib/candidate-ingestion/candidate-queue-scope";

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
