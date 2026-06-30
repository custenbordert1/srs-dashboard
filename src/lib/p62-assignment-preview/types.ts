export const P94_SOURCE_PHASE = "P94";
export const P94_PREVIEW_MODE = true as const;

export type AssignmentPreviewRiskLevel = "low" | "medium" | "high";

export type AssignmentPreviewOutcome = "assignable" | "human_review";

export type DownstreamSimulationStep = {
  step: "p62_assigned" | "p83_advancement" | "p84_recheck";
  status: "simulated" | "skipped" | "blocked";
  detail: string;
};

export type P62AssignmentPreviewEntry = {
  candidateId: string;
  candidateName: string;
  positionId: string;
  jobTitle: string;
  city: string;
  state: string;
  dmTerritory: string;
  suggestedDm: string;
  currentRecruiter: string;
  recommendedRecruiter: string;
  assignmentReason: string;
  workloadBalanceFactor: string;
  confidence: number;
  riskLevel: AssignmentPreviewRiskLevel;
  outcome: AssignmentPreviewOutcome;
  humanReviewReason: string | null;
  downstream: {
    steps: DownstreamSimulationStep[];
    expectedWorkflowStatus: string;
    expectedActionType: string;
    p83Action: string;
    p83ShouldAdvance: boolean;
    p84EligibleAfterSimulation: boolean;
    p84BlockingReasonsAfterSimulation: string[];
    stillBlockedAfterAssignment: boolean;
    remainingBlocker: string | null;
  };
  manualApprovalRequired: true;
};

export type RecruiterDistributionEntry = {
  recruiter: string;
  candidateCount: number;
};

export type P62AssignmentPreviewMetrics = {
  candidatesReviewed: number;
  candidatesAssignable: number;
  candidatesNeedingHumanReview: number;
  candidatesExpectedPaperworkNeeded: number;
  candidatesExpectedP84Eligible: number;
  candidatesStillBlockedAfterAssignment: number;
};

export type P62AssignmentPreviewReport = {
  sourcePhase: typeof P94_SOURCE_PHASE;
  previewMode: typeof P94_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  sectionTitle: "Recruiter Assignment Preview";
  cohortLabel: string;
  metrics: P62AssignmentPreviewMetrics;
  recruiterDistribution: RecruiterDistributionEntry[];
  entries: P62AssignmentPreviewEntry[];
  sampleTraces: P62AssignmentPreviewEntry[];
  remainingBlockersBeforeAutonomousPaperwork: string[];
};
