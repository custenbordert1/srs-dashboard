export const P174_SOURCE_PHASE = "P174";

export type P174LayerTrace = {
  layer: string;
  pass: boolean;
};

export type P174CandidateTrace = {
  name: string;
  email: string;
  appliedAt: string;
  position: string;
  layers: P174LayerTrace[];
  failurePoint: string | null;
  category: string | null;
};

export type P174BreezySyncValidationReport = {
  sourcePhase: typeof P174_SOURCE_PHASE;
  generatedAt: string;
  readOnly: boolean;
  executiveSummary: {
    parityStatus: "pass" | "fail";
    exportCandidates: number;
    ingestionCandidates: number;
    coveragePct: number;
    primaryBottleneck: string;
    newestInIngestion: number;
  };
  syncDashboard: {
    totalBreezyPositions: number;
    positionsScanned: number;
    positionsRemaining: number;
    candidatesInBreezyExport: number;
    candidatesRetrievedPreview: number;
    candidatesRetrievedFast: number;
    candidatesIngested: number;
    candidatesMissing: number;
    coveragePercentage: number;
    scanQueueNext: string[];
    oldestUnscannedPositionId: string | null;
    newestUnscannedPositionId: string | null;
    lastSuccessfulSync: string | null;
    lastFullCycleAt: string | null;
    cycleComplete: boolean;
    ingestionStoreUsable: boolean;
    positionCoveragePct: number;
    estimatedChunksRemaining: number;
    estimatedMinutesToFullSync: number;
  };
  layerCounts: Record<string, number>;
  positionCoverage: {
    total: number;
    scanned: number;
    skipped: number;
    failed: number;
    duplicateScans: number;
    positions: Array<{
      jobId: string;
      title: string;
      scanned: boolean;
      scannedAt: string | null;
      candidateCountOnJobList: number | null;
      exportApplicantCount: number;
      ingestedCandidateCount: number;
      issues: string[];
    }>;
  };
  paginationAnalysis: {
    pageSize: number;
    maxPagesPerPosition: number;
    maxRowsPerPosition: number;
    sortOrder: string;
    concurrency: number;
    batchDelayMs: number;
    requestTimeoutMs: number;
    maxRetryAttempts: number;
    rateLimitPerMinute: number;
    scanBudgets: { previewMs: number; fastFullAllMs: number };
    scanLimits: {
      previewMaxPositions: number;
      previewMaxPagesPerPosition: number;
      previewTargetCandidates: number;
      fastTierPositions: number;
    };
    stopConditions: string[];
    evidence: string[];
  };
  candidateTraces: P174CandidateTrace[];
  top25Newest: P174CandidateTrace[];
  rootCauseCounts: Record<string, number>;
  bottlenecks: Array<{
    rank: number;
    id: string;
    impact: string;
    detail: string;
    evidence: string;
  }>;
  rankedPermanentFixes: Array<{ rank: number; fix: string; roi: string }>;
  successCriteria: Record<string, boolean>;
};
