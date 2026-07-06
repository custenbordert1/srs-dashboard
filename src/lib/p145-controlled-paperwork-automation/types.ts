import type { PaperworkQueueItem } from "@/lib/recruiting/paperwork-automation-engine";

export const P145_SOURCE_PHASE = "P145";
export const P145_DEFAULT_MODE = "approvalRequired" as const;
export type P145ExecutionMode = "preview" | "approval";

export type PaperworkAutomationAuditEventType =
  | "queue_generated"
  | "approval_given"
  | "approval_rejected"
  | "paperwork_sent"
  | "reminder_sent";

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
};
