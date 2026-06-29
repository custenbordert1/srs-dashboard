import type { BreezyCandidate } from "@/lib/breezy-api";

export type CandidateIngestionStoreFile = {
  version: 1;
  runId: string | null;
  publishedPositionIds: string[];
  publishedPositionsTotal: number;
  /** Unique position IDs scanned in the current / latest cycle. */
  scannedPositionIds: string[];
  /** Next index in publishedPositionIds to scan. */
  checkpointIndex: number;
  candidates: Record<string, BreezyCandidate>;
  lastJobListAt: string | null;
  lastChunkAt: string | null;
  lastFullCycleAt: string | null;
  cycleComplete: boolean;
  chunksThisRun: number;
  updatedAt: string;
};

export type CandidateIngestionSyncResult = {
  ok: boolean;
  error?: string;
  chunksProcessed: number;
  positionsScannedThisRun: number;
  newCandidates: number;
  totalCandidates: number;
  publishedPositions: number;
  scannedPositions: number;
  positionCoveragePct: number;
  cycleComplete: boolean;
  checkpointIndex: number;
  workflowsCreated: number;
  workflowsBackfilled: number;
  workflowsReconciled: number;
  assigned: number;
  actionsGenerated: number;
  progressionsGenerated: number;
  captureHealth: ApplicantCaptureHealth;
};

export type ApplicantCaptureHealth = {
  breezyApplicantsMtd: number;
  osApplicantsMtd: number;
  captureRatePct: number;
  publishedPositions: number;
  scannedPositions: number;
  positionCoveragePct: number;
  unscannedPositions: number;
  missingWorkflowRecords: number;
  workflowCoveragePct: number;
  p62CoveragePct: number;
  p62CoverageAllIngestedPct: number;
  p63CoveragePct: number;
  p64CoveragePct: number;
  p62EligibleMtd: number;
  p62EligibleAllIngested: number;
  p63EligibleMtd: number;
  p64EligibleMtd: number;
  p62SkippedBelowConfidence: number;
  p62SkippedNoTerritory: number;
  unassignedApplicants: number;
  unassignedHistorical: number;
  totalUnassigned: number;
  withoutP63: number;
  withoutP64: number;
  lastSyncAt: string | null;
  cycleComplete: boolean;
  ingestionCandidateTotal: number;
};
