export const P168_SOURCE_PHASE = "P168";

export type P168ApprovalAction =
  | "WAIT"
  | "RUN_NEXT_BATCH"
  | "HOLD_INVESTIGATION"
  | "NO_ACTION_REQUIRED";

export type P168RiskLevel = "low" | "medium" | "high";

export type P168RequiredApproval = "executive";

export type P168ApprovalRecommendation = {
  id: string;
  action: P168ApprovalAction;
  title: string;
  reason: string;
  confidence: number;
  expectedSends: number;
  expectedDropboxApiRequests: number;
  expectedQueueReduction: number;
  estimatedDurationMs: number | null;
  blockingFactors: string[];
  riskLevel: P168RiskLevel;
  requiredApprovals: P168RequiredApproval[];
  schedulerRecommendation: string;
  generatedAt: string;
};

export type P168ApprovalHistoryEntry = {
  id: string;
  at: string;
  executiveUserId: string;
  executiveEmail: string | null;
  recommendation: P168ApprovalAction;
  recommendationId: string;
  approved: boolean;
  executed: boolean;
  result: "success" | "failed" | "skipped" | "dismissed" | null;
  paperworkSent: number | null;
  durationMs: number | null;
  dropboxRequests: number | null;
  errors: number | null;
  message: string | null;
};

export type P168LastExecution = {
  at: string | null;
  executiveEmail: string | null;
  paperworkSent: number | null;
  durationMs: number | null;
  dropboxRequests: number | null;
  errors: number | null;
  result: P168ApprovalHistoryEntry["result"];
};

export type P168ExecutiveApprovalReport = {
  sourcePhase: typeof P168_SOURCE_PHASE;
  generatedAt: string;
  readOnly: boolean;
  recommendation: P168ApprovalRecommendation;
  lastExecution: P168LastExecution;
  history: P168ApprovalHistoryEntry[];
  safety: {
    continuousModeEnabled: boolean;
    daemonActive: boolean;
    processingLockHeld: boolean;
    liveCycleEnvEnabled: boolean;
    manualOperatorApprovalRequired: true;
  };
  warnings: string[];
};

export type P168ApproveRequest = {
  action: "approve" | "dismiss";
  recommendationId: string;
};

export type P168ApproveResult = {
  ok: boolean;
  action: "approve" | "dismiss";
  message: string;
  executed: boolean;
  historyEntry: P168ApprovalHistoryEntry;
  report?: P168ExecutiveApprovalReport;
};
