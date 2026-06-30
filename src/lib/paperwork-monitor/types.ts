export const P107_SOURCE_PHASE = "P107";
export const P107_MONITOR_VERSION = 1;
export const P107_DEFAULT_MODE = "dryRun" as const;
export const P107_DEV_INTERVAL_MS = 5 * 60 * 1000;
export const P107_STALE_LOCK_MS = 15 * 60 * 1000;

export const P107_REMINDER_TEXT_MS = 30 * 60 * 1000;
export const P107_REMINDER_EMAIL_MS = 24 * 60 * 60 * 1000;
export const P107_REMINDER_RECRUITER_MS = 48 * 60 * 60 * 1000;
export const P107_NEEDS_ATTENTION_MS = 72 * 60 * 60 * 1000;

export type DropboxMonitorStatus =
  | "awaiting_signature"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"
  | "canceled";

export type PaperworkMonitorMode = "dryRun" | "runOnce" | "scheduled";

export type PaperworkMonitorRunnerStatus = "stopped" | "running" | "idle";

export type ReminderChannel = "sms" | "email" | "recruiter" | "needs_attention";

export type ReminderQueueEntry = {
  id: string;
  candidateId: string;
  candidateName: string;
  channel: ReminderChannel;
  generatedAt: string;
  reason: string;
  viewedAt: string;
  hoursSinceView: number;
};

export type PaperworkMonitorCandidateTracking = {
  candidateId: string;
  candidateName: string;
  signatureRequestId: string;
  lastDropboxStatus: DropboxMonitorStatus;
  viewedAt: string | null;
  signedAt: string | null;
  completedAt: string | null;
  lastCheckedAt: string;
  reminderCount: number;
  lastReminderSentAt: string | null;
  reminderHistory: Array<{ at: string; channel: ReminderChannel; reason: string }>;
  needsAttention: boolean;
  workflowStatus: string | null;
  onboardingStatus: string | null;
};

export type PaperworkMonitorLock = {
  runId: string;
  lockedAt: string;
  mode: PaperworkMonitorMode;
};

export type PaperworkMonitorState = {
  version: typeof P107_MONITOR_VERSION;
  runnerStatus: PaperworkMonitorRunnerStatus;
  scheduleEnabled: boolean;
  scheduleIntervalMs: number;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  processingLock: PaperworkMonitorLock | null;
  lastError: string | null;
  lastRunDurationMs: number | null;
  averageRunDurationMs: number | null;
  runCount: number;
  candidateTracking: Record<string, PaperworkMonitorCandidateTracking>;
  textQueue: ReminderQueueEntry[];
  emailQueue: ReminderQueueEntry[];
  recruiterQueue: ReminderQueueEntry[];
  needsAttention: ReminderQueueEntry[];
  updatedAt: string;
};

export type PaperworkMonitorMetrics = {
  awaitingSignature: number;
  viewed: number;
  signedToday: number;
  completed: number;
  expired: number;
  declined: number;
  needsReminder: number;
  needsRecruiter: number;
  readyForOnboarding: number;
  averageTimeToViewMs: number | null;
  averageTimeToSignMs: number | null;
  averageViewToSignMs: number | null;
  completionRate: number | null;
  textQueueCount: number;
  emailQueueCount: number;
  recruiterQueueCount: number;
  needsAttentionCount: number;
  activePackets: number;
  syncedThisCycle: number;
  errorsThisCycle: number;
};

export type PaperworkMonitorCandidateResult = {
  candidateId: string;
  candidateName: string;
  signatureRequestId: string;
  dropboxStatus: DropboxMonitorStatus;
  paperworkStatus: string;
  workflowStatus: string | null;
  onboardingStatus: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  synced: boolean;
  stateChanged: boolean;
  reminderGenerated: ReminderChannel | null;
  error: string | null;
  timeline: string[];
};

export type PaperworkMonitorReport = {
  sourcePhase: typeof P107_SOURCE_PHASE;
  generatedAt: string;
  sectionTitle: string;
  mode: PaperworkMonitorMode;
  state: PaperworkMonitorState;
  metrics: PaperworkMonitorMetrics;
  candidates: PaperworkMonitorCandidateResult[];
  artifactPaths: {
    monitorState: string;
    monitorAudit: string;
    workflowAudit: string;
  };
  runnerHealth: {
    healthy: boolean;
    overlapPrevented: boolean;
    lastError: string | null;
    averageRunTimeMs: number | null;
  };
  nextScheduledRunAt: string | null;
};

export type PaperworkMonitorCycleResult = {
  ok: boolean;
  skippedOverlap: boolean;
  mode: PaperworkMonitorMode;
  report: PaperworkMonitorReport;
  warnings: string[];
};

export type PaperworkStatusDetail = {
  candidateId: string;
  candidateName: string;
  signatureRequestId: string | null;
  dropboxStatus: DropboxMonitorStatus | null;
  tracking: PaperworkMonitorCandidateTracking | null;
  workflowStatus: string | null;
  onboardingStatus: string | null;
  paperworkStatus: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  reminderEligible: {
    text: boolean;
    email: boolean;
    recruiter: boolean;
    needsAttention: boolean;
  };
  auditSnippet: string[];
};
