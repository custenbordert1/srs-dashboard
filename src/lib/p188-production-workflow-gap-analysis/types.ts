/** P188 — Production workflow gap analysis (read-only). */

export const P188_SOURCE_PHASE = "P188" as const;
export const P188_SCHEMA_VERSION = 1 as const;

export type P188LifecycleBucket =
  | "Applied"
  | "Recruiter Review"
  | "Hiring Recommendation"
  | "Operator Approved"
  | "Paperwork Needed"
  | "Paperwork Sent"
  | "Viewed"
  | "Signed"
  | "Ready for MEL"
  | "Exported"
  | "Other";

export type P188StageStats = {
  stage: P188LifecycleBucket;
  totalCandidates: number;
  candidatesEnteringHint: string;
  candidatesExitingHint: string;
  averageAgeDays: number | null;
  stageOwner: string;
  productionWriter: string;
  apiResponsible: string;
  workflowResponsible: string;
  expectedNextTransition: string;
};

export type P188CandidateClassification = {
  redactedCandidateId: string;
  productionWorkflowStatus: string;
  furthestLegitimateStage: P188LifecycleBucket;
  ageDays: number | null;
  assignedRecruiter: string;
  recommendedStage: string | null;
  paperworkStatus: string | null;
  blockReasons: string[];
};

export type P188HiringRecommendationGap = {
  redactedCandidateId: string;
  missingRecommendationEvidence: boolean;
  missingRecruiterAction: boolean;
  missingApiCall: boolean;
  missingWorkflowTransition: boolean;
  unresolvedJob: boolean;
  unresolvedOwner: boolean;
  staleWorkflow: boolean;
  missingStateMapping: boolean;
  lifecycleBug: boolean;
  expectedBehavior: string;
  actualBehavior: string;
};

export type P188CodePathNode = {
  id: string;
  kind: "api" | "ui" | "workflow" | "storage" | "audit" | "enrichment";
  path: string;
  role: string;
  status:
    | "exists"
    | "executes"
    | "bypassed"
    | "disabled"
    | "obsolete"
    | "replaced"
    | "never_called"
    | "display_only";
  detail: string;
};

export type P188Recommendation = {
  missingTransition: string;
  rootCause: string;
  impact: string;
  proposedFix: string;
  implementationEffort: "S" | "M" | "L";
  productionRisk: "low" | "medium" | "high";
};

export type P188SafetyWalls = {
  productionWrites: 0;
  candidateStateChanges: 0;
  paperworkSends: 0;
  approvals: 0;
  melWrites: 0;
  automationEnabled: false;
  featureFlagsChanged: false;
};

export type P188AnalysisReport = {
  sourcePhase: typeof P188_SOURCE_PHASE;
  generatedAt: string;
  productionCommit: string;
  candidatesScanned: number;
  stageDistribution: Record<P188LifecycleBucket, number>;
  stageStats: P188StageStats[];
  furthestStageCounts: Record<P188LifecycleBucket, number>;
  hiringRecommendationCount: number;
  zeroHiringRecommendationExplanation: string[];
  codePath: P188CodePathNode[];
  recommendations: P188Recommendation[];
  flowStopPoint: string;
  safety: P188SafetyWalls;
};
