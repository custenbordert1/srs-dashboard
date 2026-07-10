export const P151_2_SOURCE_PHASE = "P151.2";

export type RecruiterAssignmentRecommendation =
  | "Assign Recruiter"
  | "Manual Review"
  | "Hold"
  | "Do Not Assign";

export type RecruiterAssignmentCandidateRow = {
  candidateId: string;
  candidateName: string;
  cityState: string;
  zip: string | null;
  distanceMiles: number | null;
  dmTerritory: string | null;
  recruiterTerritory: string | null;
  assignedRecruiter: string;
  recommendedRecruiter: string | null;
  assignmentConfidence: number;
  advancementConfidence: number;
  operationalFitScore: number | null;
  coveragePressure: number;
  duplicateStatus: boolean;
  recommendation: RecruiterAssignmentRecommendation;
  autoAssignEligible: boolean;
  reason: string;
  blockers: string[];
  assignmentReason: string;
};

export type RecruiterAssignmentDistributionRow = {
  label: string;
  count: number;
};

export type RecruiterAssignmentExecutionItem = {
  candidateId: string;
  candidateName: string;
  result: "assigned" | "skipped" | "blocked" | "failed";
  recruiter: string | null;
  reason: string;
  executionMode: "dry_run" | "live";
};

export type AutonomousRecruiterAssignmentSummary = {
  sourcePhase: typeof P151_2_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  autonomousAdvancementEnabled: boolean;
  candidatesEvaluated: number;
  assignmentsCompleted: number;
  assignmentsSkipped: number;
  assignmentsBlocked: number;
  assignmentsFailed: number;
  candidatesRemaining: number;
  recommendationCounts: Record<RecruiterAssignmentRecommendation, number>;
  recruiterDistribution: RecruiterAssignmentDistributionRow[];
  territoryDistribution: RecruiterAssignmentDistributionRow[];
  topBlockerReasons: RecruiterAssignmentDistributionRow[];
  averageRecruiterWorkload: number;
  recruiterWorkloadByName: Record<string, number>;
  executionTimeMs: number;
  capReached: boolean;
  stoppedOnError: boolean;
  safetyFlags: {
    breezyWrites: false;
    breezyCandidateMovement: false;
    executeBatchCalled: false;
  };
  rollbackRecommendation: string;
  candidates: RecruiterAssignmentCandidateRow[];
  executionItems: RecruiterAssignmentExecutionItem[];
};
