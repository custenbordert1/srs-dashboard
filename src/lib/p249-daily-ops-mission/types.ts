export const P249_PHASE = "P249-daily-ops-mission";
export const P249_OPS_DATE = "2026-07-23";

export type P249CheckStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

export type P249ChecklistItem = {
  id: string;
  category: string;
  label: string;
  status: P249CheckStatus;
  detail: string;
  automaticFix: boolean;
  manualAction: string | null;
};

export type P249BlockedReason = {
  reason: string;
  count: number;
  automaticFix: boolean;
  manualAction: string;
};

export type P249ProductionReadiness = {
  phase: typeof P249_PHASE;
  generatedAt: string;
  opsDate: typeof P249_OPS_DATE;
  mode: "read_only";
  overall: "PASS" | "FAIL" | "WARN";
  checklist: P249ChecklistItem[];
  passCount: number;
  failCount: number;
  warnCount: number;
  blockers: string[];
  modes: {
    emailMode: string;
    dropboxTestMode: boolean | null;
    resendReady: boolean;
    pilotLiveEnvOk: boolean;
  };
};

export type P249OutstandingPaperworkAnalysis = {
  phase: typeof P249_PHASE;
  generatedAt: string;
  opsDate: typeof P249_OPS_DATE;
  source: {
    p242Preview: boolean;
    p246Preview: boolean;
    workflowStore: boolean;
    reminderStorePresent: boolean;
  };
  counts: {
    eligibleForInitialPaperwork: number;
    alreadySent: number;
    outstandingDropboxSignatures: number;
    reminderEligibleTotal: number;
    reminder1: number;
    reminder2: number;
    reminder3: number;
    reminder4: number;
    viewedButNotSigned: number;
    signed: number;
    readyForMel: number;
    paperworkNeededWorkflow: number;
    paperworkSentWorkflow: number;
  };
  blockedByReason: P249BlockedReason[];
};

export type P249DryRunReport = {
  phase: typeof P249_PHASE;
  generatedAt: string;
  opsDate: typeof P249_OPS_DATE;
  zeroWritesConfirmed: true;
  liveEmailsSent: 0;
  dropboxWrites: 0;
  melWrites: 0;
  breezyWrites: 0;
  simulations: {
    initialPaperworkWouldSend: number;
    initialPaperworkDeferredOrBlocked: number;
    remindersWouldSend: number;
    remindersSkippedDuplicateOrCooldown: number;
    duplicatesDetected: number;
    dropboxRefreshProbed: number;
    dropboxRefreshOk: number;
    idempotentSkips: number;
    candidateAdvancementPlanned: number;
    openStoreEligibleWouldSend: number;
    openStoreSafeCapacity: number | null;
  };
  notes: string[];
  warnings: string[];
};

export type P249LiveExecutionPlan = {
  phase: typeof P249_PHASE;
  generatedAt: string;
  opsDate: typeof P249_OPS_DATE;
  recommendation: "GO" | "NO-GO" | "CONDITIONAL-GO";
  steps: Array<{
    order: number;
    action: string;
    count: number | null;
    command: string | null;
    risk: "low" | "medium" | "high";
    notes: string;
  }>;
  throughputEstimate: {
    initialSendsPerHour: number;
    remindersPerHour: number;
    estimatedMinutesForReminders: number | null;
    estimatedMinutesForInitialSends: number | null;
  };
  operationalRisks: string[];
};

export type P249OperationsDashboard = {
  phase: typeof P249_PHASE;
  generatedAt: string;
  opsDate: typeof P249_OPS_DATE;
  newApplicants: number;
  paperworkNeeded: number;
  eligibleToSend: number;
  paperworkSent: number;
  outstandingSignatures: number;
  reminder1: number;
  reminder2: number;
  reminder3: number;
  reminder4: number;
  viewed: number;
  signedToday: number;
  readyForMel: number;
  blocked: number;
  pipelineHealthPct: number;
  estimatedRecruiterHoursSaved: number;
};

export type P249GoNoGo = {
  phase: typeof P249_PHASE;
  generatedAt: string;
  opsDate: typeof P249_OPS_DATE;
  decision: "GO" | "NO-GO" | "CONDITIONAL-GO";
  pipelineHealthScore: number;
  eligibleFirstTimePaperwork: number;
  eligibleReminders: number;
  expectedReadyForMelToday: number;
  blockers: string[];
  justification: string;
};

export type P249MissionResult = {
  readiness: P249ProductionReadiness;
  outstanding: P249OutstandingPaperworkAnalysis;
  dryRun: P249DryRunReport;
  livePlan: P249LiveExecutionPlan;
  dashboard: P249OperationsDashboard;
  goNoGo: P249GoNoGo;
  artifacts: string[];
};
