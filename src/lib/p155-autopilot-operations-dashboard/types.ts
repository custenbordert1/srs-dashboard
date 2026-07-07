export const P155_SOURCE_PHASE = "P155";

export type P155RunnerDisplayStatus = "disabled" | "running" | "idle" | "paused" | "error";

export type P155AutopilotStatusSection = {
  enabled: boolean;
  continuousEnabled: boolean;
  runnerStatus: P155RunnerDisplayStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
  uptimeMs: number | null;
  serverStartTime: string | null;
  intervalMinutes: number;
  maxSendsPerCycle: number;
  maxAssignmentsPerCycle: number;
  processingLockHeld: boolean;
  lastError: string | null;
};

export type P155TodayActivitySection = {
  candidatesEvaluated: number;
  recruitersAssigned: number;
  paperworkSent: number;
  paperworkSigned: number;
  activeSignatureRequests: number;
  duplicatesPrevented: number;
  failures: number;
};

export type P155QueueHealthSection = {
  eligibleForPaperwork: number;
  waitingOnSignature: number;
  signedToday: number;
  invalidEmail: number;
  duplicateCandidates: number;
  manualReview: number;
  disqualifiedArchived: number;
  needsRecruiterAssignment: number;
  queueRemaining: number;
};

export type P155RecentSendRow = {
  candidateId: string;
  candidateName: string;
  email: string;
  recruiter: string;
  dm: string;
  signatureRequestId: string | null;
  status: string;
  sentAt: string;
  dryRun: boolean;
};

export type P155ExceptionRow = {
  id: string;
  category:
    | "failed_send"
    | "webhook_failure"
    | "invalid_email"
    | "duplicate_conflict"
    | "manual_review"
    | "runner_error";
  candidateId: string | null;
  candidateName: string | null;
  detail: string;
  at: string;
};

export type P155OperationsDashboard = {
  sourcePhase: typeof P155_SOURCE_PHASE;
  generatedAt: string;
  status: P155AutopilotStatusSection;
  today: P155TodayActivitySection;
  queue: P155QueueHealthSection;
};

export type P155ControlAction = "dry_cycle" | "live_cycle" | "pause" | "resume" | "refresh";

export type P155ControlResult = {
  ok: boolean;
  action: P155ControlAction;
  message: string;
  dryRun: boolean;
  dashboard: P155OperationsDashboard;
  cycleReport?: unknown;
};
