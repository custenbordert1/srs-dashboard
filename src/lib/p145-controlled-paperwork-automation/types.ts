import type { PaperworkQueueItem } from "@/lib/recruiting/paperwork-automation-engine";
import type { AutoSendExecutionSummary } from "@/lib/recruiting/paperwork-execution-engine";
import type { InitialPaperworkExecutionSummary } from "@/lib/recruiting/initial-paperwork-execution-engine";

export const P145_SOURCE_PHASE = "P145";
export const P145_DEFAULT_MODE = "approvalRequired" as const;
export type P145ExecutionMode = "preview" | "approval";

export type PaperworkAutomationAuditEventType =
  | "queue_generated"
  | "approval_given"
  | "approval_rejected"
  | "paperwork_sent"
  | "reminder_sent"
  | "initial_paperwork_sent";

export type PaperworkAutomationAuditEvent = {
  id: string;
  at: string;
  type: PaperworkAutomationAuditEventType;
  userId: string;
  userEmail: string;
  candidateId: string;
  project: string;
  recommendedAction: string;
  reason: string;
  executed: boolean;
  simulated: boolean;
  candidateName?: string;
  email?: string;
  recruiter?: string;
  autoSendEligible?: boolean;
  sendResult?: "sent" | "skipped" | "blocked" | "failed";
  blockedReason?: string | null;
  cooldownCheck?: { passed: boolean; reason: string };
  paperworkStatusBeforeSend?: string;
  templateUsed?: string | null;
  executionMode?: "dry_run" | "live";
  jobId?: string;
  validationResult?: { passed: boolean; reasons: string[] };
  duplicatePrevented?: boolean;
};

export type PaperworkApprovalQueueRow = PaperworkQueueItem & {
  selected: boolean;
  approvalStatus: "pending" | "approved" | "rejected";
  approveEnabled: boolean;
  rejectEnabled: boolean;
};

export type PaperworkExecutiveMetrics = {
  outstandingPaperwork: number;
  readyToSend: number;
  readyForReminder: number;
  waitingOnCandidate: number;
  manualReviewRequired: number;
  averageDaysWaiting: number;
  recruitersWithLargestQueue: Array<{ recruiter: string; count: number }>;
  projectsWithMostOutstanding: Array<{ project: string; count: number }>;
};

export type PaperworkValidationReport = {
  outstandingPaperworkCount: number;
  initialPaperworkCount: number;
  reminder1Count: number;
  reminder2Count: number;
  manualReviewCount: number;
  averagePaperworkAgeHours: number;
  averageResponseTimeHours: number;
  topProjectsByOutstanding: Array<{ project: string; count: number }>;
  topRecruitersByWorkload: Array<{ recruiter: string; count: number }>;
};

export type PaperworkAutoSendMetrics = {
  autoSendEnabled: boolean;
  eligibleRemindersToday: number;
  sentToday: number;
  skipped: number;
  blocked: number;
  failures: number;
  cooldownBlocked: number;
  manualReviewRequired: number;
  duplicatesPrevented: number;
  reminderSuccessRate: number;
  candidatesStillWaiting: number;
};

export type InitialPaperworkAutoSendMetrics = {
  autoSendEnabled: boolean;
  initialPaperworkSentToday: number;
  eligibleCandidates: number;
  blockedCandidates: number;
  duplicatesPrevented: number;
  executionSuccessRate: number;
  averageTimeToPaperworkHours: number;
};

export type ControlledPaperworkAutomationSnapshot = {
  sourcePhase: typeof P145_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P145_DEFAULT_MODE;
  executionMode: P145ExecutionMode;
  partialSync: boolean;
  candidatesEvaluated: number;
  queue: PaperworkQueueItem[];
  approvalQueue: PaperworkApprovalQueueRow[];
  executive: PaperworkExecutiveMetrics;
  validation: PaperworkValidationReport;
  recentAuditEvents: PaperworkAutomationAuditEvent[];
  executeBatchCalled: false;
  breezyWrites: false;
  paperworkSent: false;
  liveModeEnabled: boolean;
  executionEnabled: boolean;
  autoSend: PaperworkAutoSendMetrics;
  initialPaperwork: InitialPaperworkAutoSendMetrics;
  lastAutoSendSummary: AutoSendExecutionSummary | null;
  lastInitialPaperworkSummary: InitialPaperworkExecutionSummary | null;
};
