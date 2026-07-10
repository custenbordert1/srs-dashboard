export const P143_SOURCE_PHASE = "P143";

/** How candidate rows were chosen for the live snapshot KPI. */
export type LiveSnapshotCandidateSource =
  | "live_preview"
  | "live_cache"
  | "ingestion_fallback"
  | "mixed";

export type IngestionFallbackReason =
  | "preview_empty"
  | "preview_fetch_failed"
  | "cold_preview_cache"
  | "preview_server_budget_undercount"
  | "preview_partial_undercount"
  | "preview_undercount_vs_ingestion";

export type LiveSnapshotCandidateMetadata = {
  candidateSource: LiveSnapshotCandidateSource;
  candidateCount: number;
  ingestionCandidateCount: number | null;
  previewCandidateCount: number | null;
  fallbackReason: IngestionFallbackReason | null;
  candidatesFreshnessTimestamp: string;
};

export type LiveSnapshotIngestionFallbackRules = {
  undercountRatio: number;
  useFallbackWhenPreviewEmpty: boolean;
  useFallbackWhenPreviewFailed: boolean;
  useFallbackWhenUndercountVsIngestion: boolean;
  useFallbackWhenServerBudget: boolean;
  useFallbackWhenPartialScan: boolean;
};

export type LiveSnapshotIngestionFallbackArtifact = {
  sourcePhase: typeof P143_SOURCE_PHASE;
  generatedAt: string;
  beforeCounts: {
    previewOnly: number | null;
    ingestionStore: number | null;
    uiWouldShowBeforeFix: number | null;
  };
  afterCounts: {
    liveSnapshotCandidateCount: number | null;
    candidateSource: LiveSnapshotCandidateSource | null;
    syncStatus: string | null;
  };
  fallbackRules: LiveSnapshotIngestionFallbackRules;
  uiMetadata: LiveSnapshotCandidateMetadata | null;
  safetyConfirmation: {
    executeBatchCalled: false;
    breezyWrites: false;
    liveModeEnabled: boolean;
    paperworkSent: false;
    p122ExecutionUnchanged: true;
  };
};
