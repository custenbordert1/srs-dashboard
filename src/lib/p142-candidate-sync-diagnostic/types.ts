export const P142_SOURCE_PHASE = "P142";
export const P142_DIAGNOSTIC_MODE = "readOnly" as const;

export type IssueClassification = "data_issue" | "ui_issue" | "architecture_split";

export type CacheLayerDiagnostic = {
  layer: string;
  pathOrKey: string;
  candidateCount: number | null;
  timestamp: string | null;
  notes: string[];
};

export type ApiPathDiagnostic = {
  path: string;
  scanMode: string | null;
  candidateCount: number | null;
  ok: boolean | null;
  usesIngestionStore: boolean;
  error: string | null;
};

export type OpsComponentDiagnostic = {
  phase: string;
  name: string;
  uiVisible: boolean;
  uiLocation: string | null;
  apiRoute: string | null;
  apiRouteExists: boolean;
  notes: string;
};

export type CandidateSyncDiagnosticReport = {
  sourcePhase: typeof P142_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P142_DIAGNOSTIC_MODE;
  rootCause: string;
  exactFailingComponent: string;
  issueClassification: IssueClassification;
  recommendedFix: string;
  ingestionStore: {
    path: string;
    candidateCount: number;
    cycleComplete: boolean;
    publishedPositionsTotal: number;
    scannedPositionCount: number;
    positionCoveragePct: number;
    lastChunkAt: string | null;
    updatedAt: string;
    usableForPaperwork: boolean;
  };
  cacheLayers: CacheLayerDiagnostic[];
  apiPaths: ApiPathDiagnostic[];
  liveSnapshot: {
    ok: boolean;
    syncStatus: string | null;
    candidatesPulled: number | null;
    publishedJobs: number | null;
    candidatesFromCache: boolean | null;
    kpiSnapshotBuilt: boolean | null;
    error: string | null;
  };
  commandCenterUi: {
    candidatesPulledLabel: string;
    dataSourceApi: string;
    kpiSnapshotApi: string;
    whyZeroCandidatesPulled: string;
    whyKpiSnapshotMissing: string;
  };
  paperworkCandidateSource: {
    loader: string;
    candidateCount: number;
    sameAsCommandCenterKpi: boolean;
  };
  opsComponents: OpsComponentDiagnostic[];
  whyOpsPanelsNotVisibleOnRecruitingTab: string;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
  executeBatchCalled: false;
};
