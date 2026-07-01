export const P123_SOURCE_PHASE = "P123";
export const P123_DEFAULT_CYCLE_MODE = "dryRun" as const;
export const P123_AVERAGE_SEND_MINUTES = 3;

export type PaperworkEligibilityStatus =
  | "READY_TO_SEND"
  | "READY_AFTER_APPROVAL"
  | "WAITING_SIGNATURE"
  | "WAITING_JOB_POST"
  | "WAITING_MAPPING"
  | "WAITING_RECRUITER"
  | "WAITING_DM"
  | "BLOCKED"
  | "INVALID_EMAIL"
  | "DUPLICATE"
  | "ALREADY_SENT"
  | "NO_PROJECT"
  | "NO_TEMPLATE";

export type PaperworkCycleStep =
  | "load_candidates"
  | "evaluate_eligibility"
  | "evaluate_safety"
  | "evaluate_approvals"
  | "build_queue"
  | "execute_one"
  | "audit"
  | "monitoring"
  | "complete";

export type OrchestratorCandidateRecord = {
  candidateId: string;
  candidateName: string;
  email: string;
  positionId: string | null;
  positionTitle: string | null;
  recruiter: string | null;
  dm: string | null;
  eligibilityStatus: PaperworkEligibilityStatus;
  requiredAction: string;
  blockingReasons: string[];
  templateKey: string | null;
  mappingConfidence: number;
  coverageImpact: number;
  duplicateRisk: boolean;
  manualPriorityOverride: number;
  candidateAgeDays: number;
  projectDeadlineScore: number;
  priorityScore: number;
  approvedMappingReady: boolean;
  onPilotAllowlist: boolean;
  safeToSend: boolean;
};

export type SendQueueSnapshot = {
  nextCandidate: OrchestratorCandidateRecord | null;
  nextFive: OrchestratorCandidateRecord[];
  remainingQueue: OrchestratorCandidateRecord[];
  queueDepth: number;
  estimatedCompletionMinutes: number;
};

export type OrchestratorSafetyState = {
  checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  goNoGo: "GO" | "NO-GO";
  reason: string;
};

export type OperatorTimelineEntry = {
  at: string;
  label: string;
  detail?: string;
};

export type PaperworkCycleExecutionResult = {
  executed: boolean;
  mode: "dryRun" | "executeOne" | "none";
  candidateId: string | null;
  outcome: "sent" | "skipped" | "failed" | "not_executed" | "simulated";
  signatureRequestId: string | null;
  error: string | null;
  retryAttempt: number;
  executeBatchCalled: false;
};

export type PaperworkCycleReport = {
  sourcePhase: typeof P123_SOURCE_PHASE;
  generatedAt: string;
  cycleId: string;
  cycleStatus: "idle" | "running" | "completed" | "blocked";
  currentStep: PaperworkCycleStep;
  progressPercent: number;
  candidates: OrchestratorCandidateRecord[];
  readyCandidates: OrchestratorCandidateRecord[];
  blockedCandidates: OrchestratorCandidateRecord[];
  sendQueue: SendQueueSnapshot;
  safetyState: OrchestratorSafetyState;
  execution: PaperworkCycleExecutionResult;
  operatorTimeline: OperatorTimelineEntry[];
  metrics: {
    candidatesEvaluated: number;
    readyCount: number;
    blockedCount: number;
    successRate: number;
    averageSendTimeMinutes: number;
    queueDepth: number;
  };
  operatorMode: string;
  pilotMode: boolean;
  liveMode: boolean;
  approvalRequired: boolean;
  warnings: string[];
  errors: string[];
  etaMinutes: number | null;
  lastExecutionAt: string | null;
};

export type ProductionReadinessGoStatus = "GO" | "GO WITH CONDITIONS" | "NO-GO";

export type ProductionReadinessReport = {
  sourcePhase: typeof P123_SOURCE_PHASE;
  generatedAt: string;
  currentQueue: SendQueueSnapshot;
  readyCandidates: OrchestratorCandidateRecord[];
  blockedCandidates: OrchestratorCandidateRecord[];
  safetyGates: OrchestratorSafetyState;
  pilotConfiguration: Record<string, unknown>;
  operatorConfiguration: Record<string, unknown>;
  retryPolicy: {
    retryable: string[];
    neverRetry: string[];
    backoffMs: number[];
  };
  executionFlow: string[];
  productionChecklist: Array<{ item: string; status: "COMPLETE" | "PARTIAL" | "NOT_READY"; notes: string }>;
  knownBlockers: string[];
  riskAssessment: string[];
  goNoGo: ProductionReadinessGoStatus;
  goNoGoReason: string;
};

export type PaperworkCycleMonitorState = {
  version: 1;
  updatedAt: string;
  currentCycle: PaperworkCycleReport | null;
};
