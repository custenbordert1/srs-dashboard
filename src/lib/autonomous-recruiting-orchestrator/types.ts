export const P74_SOURCE_PHASE = "P74";
export const P74_PREVIEW_MODE = true as const;
export const P74_DEFAULT_ORCHESTRATOR_ENABLED = false;
export const P74_DEFAULT_EXECUTION_MODE = "preview" as const;

export type OrchestratorExecutionMode = "off" | "preview" | "pilot" | "production";

export type OrchestratorEngineId =
  | "recruiting_intelligence"
  | "paperwork_intelligence"
  | "paperwork_execution"
  | "communication"
  | "onboarding"
  | "executive";

export type OrchestratorWorkflowStage =
  | "coverage_need"
  | "applied"
  | "candidate_intelligence"
  | "recruiter_approval"
  | "paperwork"
  | "communication"
  | "onboarding"
  | "ready_for_work"
  | "workflow_complete"
  | "blocked";

export type OrchestratorRiskLevel = "low" | "medium" | "high" | "critical";

export type EngineHealthStatus = "healthy" | "warning" | "blocked" | "offline";

export type P74FeatureFlags = {
  orchestratorEnabled: boolean;
  executionMode: OrchestratorExecutionMode;
  previewMode: boolean;
  updatedAt: string;
};

export type OrchestratorControls = {
  orchestratorEnabled: boolean;
  executionMode: OrchestratorExecutionMode;
  previewMode: boolean;
  canExecute: boolean;
  previewOnly: boolean;
};

export type CandidateOrchestrationSnapshot = {
  candidateId: string;
  candidateName: string;
  workflowStage: OrchestratorWorkflowStage;
  workflowStatus: string;
  blockers: string[];
  nextAction: string;
  responsibleEngine: OrchestratorEngineId;
  automationEligible: boolean;
  automationEligibilityReason: string;
  estimatedCompletionAt: string | null;
  riskLevel: OrchestratorRiskLevel;
  recruiter: string;
  districtManager: string | null;
};

export type OrchestratorTimelineStep = {
  id: string;
  at: string;
  label: string;
  engine: OrchestratorEngineId | null;
  reason: string;
  result: string;
  executionMode: OrchestratorExecutionMode;
  preview: boolean;
};

export type EngineHealthReport = {
  engineId: OrchestratorEngineId;
  label: string;
  status: EngineHealthStatus;
  explanation: string;
  metrics: Record<string, number | string>;
};

export type AutomationReadinessScore = {
  overall: number;
  contributors: Array<{
    id: string;
    label: string;
    score: number;
    weight: number;
    detail: string;
  }>;
  summary: string;
  improvements: string[];
};

export type OrchestratorExecutiveMetrics = {
  candidatesEnteringWorkflow: number;
  workflowCompletions: number;
  averageWorkflowTimeHours: number | null;
  candidatesAwaitingAction: number;
  automationCompletionPercent: number | null;
  recruiterTimeSaved: number;
  blockedWorkflows: number;
  healthyWorkflows: number;
  readyForExecution: number;
};

export type OrchestratorStageBucket = {
  stage: OrchestratorWorkflowStage;
  label: string;
  count: number;
  candidateIds: string[];
};

export type OrchestratorDashboardSnapshot = {
  sourcePhase: typeof P74_SOURCE_PHASE;
  previewMode: typeof P74_PREVIEW_MODE;
  fetchedAt: string;
  controls: OrchestratorControls;
  lifecycleFlow: string[];
  workflowHealth: {
    healthy: number;
    warning: number;
    blocked: number;
    total: number;
  };
  candidatesByStage: OrchestratorStageBucket[];
  automationProgress: {
    automated: number;
    manual: number;
    percent: number | null;
  };
  waitingHumanAction: CandidateOrchestrationSnapshot[];
  readyForAutomation: CandidateOrchestrationSnapshot[];
  blockedCandidates: CandidateOrchestrationSnapshot[];
  recentActivity: OrchestratorTimelineStep[];
  upcomingAutomations: Array<{
    candidateId: string;
    candidateName: string;
    engine: OrchestratorEngineId;
    action: string;
    scheduledAt: string | null;
  }>;
  engineHealth: EngineHealthReport[];
  readinessScore: AutomationReadinessScore;
  executiveMetrics: OrchestratorExecutiveMetrics;
  sampleTimeline: OrchestratorTimelineStep[];
  warnings: string[];
};

export type CandidateOrchestrationPreviewSnapshot = {
  candidateId: string;
  candidateName: string;
  orchestration: CandidateOrchestrationSnapshot;
  timeline: OrchestratorTimelineStep[];
};

export type AutonomousRecruitingOrchestratorPreviewResult = {
  ok: true;
  previewMode: typeof P74_PREVIEW_MODE;
  fetchedAt: string;
  dashboard: OrchestratorDashboardSnapshot;
  candidate: CandidateOrchestrationPreviewSnapshot | null;
  warnings: string[];
};
