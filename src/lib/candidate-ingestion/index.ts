export { buildApplicantCaptureHealth } from "@/lib/candidate-ingestion/build-capture-metrics";
export { backfillWorkflowRecordsForCandidates } from "@/lib/candidate-ingestion/backfill-workflow-records";
export {
  CANDIDATE_QUEUE_SCOPE_LABELS,
  candidateQueueScopeHint,
  filterCandidatesByQueueScope,
  isHistoricalApplicant,
  isMtdApplicant,
} from "@/lib/candidate-ingestion/candidate-queue-scope";
export type { CandidateQueueScope } from "@/lib/candidate-ingestion/candidate-queue-scope";
export {
  currentMtdDateRange,
  filterMtdCandidates,
  listIngestedMtdCandidates,
} from "@/lib/candidate-ingestion/mtd-candidates";
export {
  resolveCandidatesForAutomation,
  resolveCandidatesForRead,
} from "@/lib/candidate-ingestion/resolve-candidates-for-read";
export {
  emptyIngestionStore,
  ingestionPositionCoveragePct,
  isIngestionStoreUsable,
  listIngestedCandidates,
  readIngestionStore,
  writeIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
export { runPostImportPipeline } from "@/lib/candidate-ingestion/run-post-import-pipeline";
export { runCandidateIngestionSync } from "@/lib/candidate-ingestion/run-ingestion-sync";
export type {
  ApplicantCaptureHealth,
  CandidateIngestionStoreFile,
  CandidateIngestionSyncResult,
} from "@/lib/candidate-ingestion/types";

import type { BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  isIngestionStoreUsable,
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";

export async function getIngestedCandidatesSnapshot(): Promise<BreezyCandidatesSuccess | null> {
  const store = await readIngestionStore();
  if (!isIngestionStoreUsable(store)) return null;

  const candidates = listIngestedCandidates(store);
  const scanned = new Set(store.scannedPositionIds).size;
  const total = store.publishedPositionsTotal;
  const fetchedAt = store.lastChunkAt ?? store.updatedAt;

  return {
    ok: true,
    candidates,
    fetchedAt,
    companyId: "",
    totalPositionsAvailable: total,
    totalPositions: total,
    positionsScanned: scanned,
    totalCandidatesPulled: candidates.length,
    totalCandidatesFetched: candidates.length,
    truncated: !store.cycleComplete,
    hydrationComplete: store.cycleComplete,
    scanMode: "all",
    syncNotes: [
      `Durable ingestion store: ${scanned}/${total} positions scanned.`,
      store.cycleComplete ? "Full position cycle complete." : "Ingestion cycle in progress.",
    ],
    skippedCandidatesReason: {
      sanitizeRejected: 0,
      missingAppliedDate: 0,
      duplicateCandidateId: 0,
      outsideDateRange: 0,
      positionPaginationIncomplete: 0,
      positionFetchFailed: 0,
      positionScanTimedOut: 0,
      positionsNotScanned: Math.max(0, total - scanned),
    },
  };
}
