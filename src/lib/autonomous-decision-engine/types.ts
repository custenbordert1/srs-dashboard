export const P76_SOURCE_PHASE = "P76";
export const P76_PREVIEW_MODE = true as const;
export const P76_DEFAULT_DECISION_ENGINE_ENABLED = false;
export const P76_DEFAULT_EXECUTION_MODE = "preview" as const;

export type DecisionExecutionMode = "off" | "preview" | "pilot" | "production";

export type DecisionCategory =
  | "candidate"
  | "paperwork"
  | "communication"
  | "onboarding"
  | "recruiting"
  | "operations"
  | "executive"
  | "automation";

export type DecisionRisk = "low" | "medium" | "high" | "critical";

export type DecisionPriority = "critical" | "high" | "medium" | "low";

export type P76FeatureFlags = {
  decisionEngineEnabled: boolean;
  executionMode: DecisionExecutionMode;
  previewMode: boolean;
  updatedAt: string;
};

export type DecisionControls = {
  decisionEngineEnabled: boolean;
  executionMode: DecisionExecutionMode;
  previewMode: boolean;
  canExecute: boolean;
  previewOnly: boolean;
};

export type AutonomousDecision = {
  decisionId: string;
  category: DecisionCategory;
  decision: string;
  reason: string;
  confidence: number;
  priority: DecisionPriority;
  risk: DecisionRisk;
  requiredEngine: string;
  dependencies: string[];
  blockedBy: string[];
  expectedOutcome: string;
  estimatedRecruiterTimeSavedMinutes: number;
  executiveExplanation: string;
  affectedCandidateIds: string[];
  affectedCandidateNames: string[];
  humanApprovalRequired: boolean;
  automationReady: boolean;
  blocked: boolean;
};

export type DecisionSimulationResult = {
  decisionId: string;
  decision: string;
  simulated: true;
  previewOnly: true;
  wouldExecute: string[];
  wouldNotExecute: string[];
  expectedOutcome: string;
  estimatedRecruiterTimeSavedMinutes: number;
  sideEffects: string[];
  estimatedImpact: string;
  auditNote: string;
};

export type DecisionExecutiveMetrics = {
  totalDecisions: number;
  automationReadyDecisions: number;
  humanReviewDecisions: number;
  averageConfidence: number | null;
  averageRiskScore: number | null;
  recruiterHoursSaved: number;
  highestValueRecommendation: string | null;
};

export type DecisionDashboardSnapshot = {
  sourcePhase: typeof P76_SOURCE_PHASE;
  previewMode: typeof P76_PREVIEW_MODE;
  fetchedAt: string;
  controls: DecisionControls;
  recommendedDecisions: AutonomousDecision[];
  highConfidenceDecisions: AutonomousDecision[];
  lowConfidenceDecisions: AutonomousDecision[];
  blockedDecisions: AutonomousDecision[];
  humanApprovalRequired: AutonomousDecision[];
  automationReady: AutonomousDecision[];
  topOpportunities: AutonomousDecision[];
  biggestRisks: AutonomousDecision[];
  executiveMetrics: DecisionExecutiveMetrics;
  warnings: string[];
};

export type AutonomousDecisionEnginePreviewResult = {
  ok: true;
  previewMode: typeof P76_PREVIEW_MODE;
  fetchedAt: string;
  dashboard: DecisionDashboardSnapshot;
  warnings: string[];
};
