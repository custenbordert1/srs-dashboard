export const P250_PHASE = "P250-go-live-preparation";
export const P250_OPS_DATE = "2026-07-23";

export type P250CheckStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

export type P250BlockerRemediation = {
  id: string;
  severity: "blocker" | "warn";
  category: string;
  check: string;
  status: P250CheckStatus;
  observed: string;
  remediationSteps: string[];
  verificationCommand: string | null;
  automaticFix: false;
};

export type P250BlockersAndRemediation = {
  phase: typeof P250_PHASE;
  generatedAt: string;
  opsDate: typeof P250_OPS_DATE;
  mode: "read_only";
  readinessOverall: "PASS" | "FAIL" | "WARN";
  passCount: number;
  failCount: number;
  warnCount: number;
  modes: {
    emailMode: string;
    dropboxTestMode: boolean | null;
    resendReady: boolean;
    pilotLiveEnvOk: boolean;
  };
  blockers: P250BlockerRemediation[];
  warnings: P250BlockerRemediation[];
  envPresence: Array<{
    name: string;
    present: boolean;
    notes: string;
  }>;
  source: {
    readinessRefreshed: true;
    p249ArtifactsReused: string[];
  };
};

export type P250SafetyControl = {
  id: string;
  control: string;
  status: "present" | "partial" | "missing" | "operator_dependent";
  evidence: string;
  residualRisk: string | null;
};

export type P250ProductionSafetyReview = {
  phase: typeof P250_PHASE;
  generatedAt: string;
  opsDate: typeof P250_OPS_DATE;
  mode: "read_only_code_and_ops_review";
  controls: P250SafetyControl[];
  remainingProductionRisks: string[];
  liveWriteGuards: string[];
};

export type P250LaunchStep = {
  order: number;
  stage: string;
  action: string;
  count: number | null;
  command: string | null;
  verify: string[];
  rollback: string[];
  stopConditions: string[];
  risk: "low" | "medium" | "high";
};

export type P250ControlledLaunchPlan = {
  phase: typeof P250_PHASE;
  generatedAt: string;
  opsDate: typeof P250_OPS_DATE;
  recommendation: "GO" | "NO-GO" | "CONDITIONAL-GO";
  prerequisiteBlockers: string[];
  volumes: {
    testEmail: 1;
    initialPaperwork: number;
    reminder1Batch: number;
    readyForMel: number;
    openStoreSafeCapacity: number | null;
  };
  steps: P250LaunchStep[];
  monitoring: string[];
  explicitApprovalRequired: true;
  noLiveExecutionInP250: true;
};

export type P250OperationsDashboard = {
  phase: typeof P250_PHASE;
  generatedAt: string;
  opsDate: typeof P250_OPS_DATE;
  sourceArtifact: string;
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
  dryRunZeroWritesConfirmed: boolean;
};

export type P250GoNoGo = {
  phase: typeof P250_PHASE;
  generatedAt: string;
  opsDate: typeof P250_OPS_DATE;
  decision: "GO" | "NO-GO" | "CONDITIONAL-GO";
  readinessScore: number;
  blockers: string[];
  expectedVolumes: {
    initialPaperworkSends: number;
    reminder1Sends: number;
    readyForMel: number;
  };
  remainingRisks: string[];
  recommendedLaunchWindow: string;
  onlyRemainingAction: string;
  justification: string;
};

export type P250MissionResult = {
  blockers: P250BlockersAndRemediation;
  safety: P250ProductionSafetyReview;
  launchPlan: P250ControlledLaunchPlan;
  dashboard: P250OperationsDashboard;
  goNoGo: P250GoNoGo;
  artifacts: string[];
};
