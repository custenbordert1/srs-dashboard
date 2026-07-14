import type { CandidateRecruitingActions } from "@/lib/candidate-recruiting-actions";
import { emptyRecruitingActions } from "@/lib/candidate-recruiting-actions";
import {
  normalizeDirectDepositStatus,
  type DirectDepositStatus,
} from "@/lib/direct-deposit-types";

export type RecruiterAssignmentSource =
  | "auto"
  | "manual"
  | "operator_restore"
  | "operator_confirmed_historical_restore"
  | "production_assignment"
  | "internal_assignment"
  | "breezy_import"
  | "territory_default";

const RECRUITER_ASSIGNMENT_SOURCES = new Set<string>([
  "auto",
  "manual",
  "operator_restore",
  "operator_confirmed_historical_restore",
  "production_assignment",
  "internal_assignment",
  "breezy_import",
  "territory_default",
]);

export function isRecruiterAssignmentSource(
  value: unknown,
): value is RecruiterAssignmentSource {
  return typeof value === "string" && RECRUITER_ASSIGNMENT_SOURCES.has(value);
}

export type RecruiterActionType =
  | "assign-recruiter"
  | "screen-candidate"
  | "needs-review"
  | "schedule-interview"
  | "send-paperwork"
  | "await-signature"
  | "follow-up"
  | "verify-paperwork"
  | "await-dd"
  | "load-mel"
  | "training"
  | "monitor"
  | "none";

export type RecruiterActionPriority = "high" | "medium" | "low";

export type CandidateWorkflowStatus =
  | "Applied"
  | "Needs Review"
  | "Qualified"
  | "Not Qualified"
  | "Operator Approved"
  | "Paperwork Needed"
  | "Paperwork Sent"
  | "Signed"
  | "Awaiting DD Verification"
  | "Ready for MEL"
  | "Loaded in MEL"
  | "Training Needed"
  | "Active Rep";

export type PaperworkStatus = "not_sent" | "sent" | "viewed" | "signed" | "declined" | "failed";

export type CandidateWorkflowEvent = {
  id: string;
  type: "status" | "note" | "assignment" | "snooze" | "follow_up" | "paperwork";
  message: string;
  createdAt: string;
};

export type CandidateWorkflowRecord = {
  candidateId: string;
  workflowStatus: CandidateWorkflowStatus;
  notes: string[];
  assignedRecruiter: string;
  assignedDM: string;
  lastActionAt: string | null;
  nextActionNeeded: string;
  history: CandidateWorkflowEvent[];
  recruitingActions: CandidateRecruitingActions;
  /** ISO datetime when follow-up is due (local overlay). */
  followUpDueAt: string | null;
  /** Hide from my-open until this ISO datetime. */
  snoozedUntil: string | null;
  signatureRequestId: string | null;
  paperworkTemplateKey: string | null;
  paperworkSentAt: string | null;
  paperworkViewedAt: string | null;
  paperworkViewCount: number;
  paperworkSignedAt: string | null;
  paperworkStatus: PaperworkStatus;
  paperworkError: string | null;
  /** Candidate email captured at paperwork send (used for payroll follow-up). */
  onboardingContactEmail: string | null;
  directDepositStatus: DirectDepositStatus;
  directDepositRequestedAt: string | null;
  directDepositLastReminderAt: string | null;
  directDepositNotes: string | null;
  /** User id who last triggered DD email (null = automated webhook). */
  directDepositTriggeredByUserId: string | null;
  /** Last send transport: log outbox vs Resend API. */
  directDepositLastDeliveryMode: "log" | "resend" | null;
  /** Whether the last DD send included an HR BCC copy. */
  directDepositLastHrCopyIncluded: boolean | null;
  /** BCC address used on the last DD send, if any. */
  directDepositLastHrBccAddress: string | null;
  recruiterAssignmentSource?: RecruiterAssignmentSource | null;
  recruiterAssignmentReason?: string | null;
  recruiterAssignmentConfidence?: number | null;
  recruiterAssignedAt?: string | null;
  /** Optimistic concurrency version for recruiter ownership (P188.4). */
  recruiterOwnershipVersion?: number;
  requiredAction?: string | null;
  actionType?: RecruiterActionType | null;
  actionPriority?: RecruiterActionPriority | null;
  actionReason?: string | null;
  actionDueDate?: string | null;
  actionConfidence?: number | null;
  actionGeneratedAt?: string | null;
  recommendedStage?: string | null;
  progressionReason?: string | null;
  progressionConfidence?: number | null;
  progressionPriority?: RecruiterActionPriority | null;
  progressionGeneratedAt?: string | null;
  updatedAt: string;
};

export type { DirectDepositStatus };

export type RecruiterRosters = {
  recruiters: string[];
  dms: string[];
};

/** On-disk workflow overlay (version 2). */
export type CandidateWorkflowStoreFile = {
  version: 2;
  workflows: CandidateWorkflowState;
  rosters: RecruiterRosters;
  updatedAt: string;
};

export type CandidateWorkflowBundle = {
  workflows: CandidateWorkflowState;
  rosters: RecruiterRosters;
  updatedAt: string;
};

export const DEFAULT_RECRUITER_ROSTER = [
  "Unassigned",
  "Taylor",
  "Alex",
  "Jordan",
  "Morgan",
  "Casey",
  "Riley",
  "Sam",
  "Chris",
  "Drew",
  "Logan",
  "Recruiting Team",
] as const;
export const DEFAULT_DM_ROSTER = ["Unassigned", "Field Ops"] as const;

export function defaultRecruiterRosters(): RecruiterRosters {
  return {
    recruiters: [...DEFAULT_RECRUITER_ROSTER],
    dms: [...DEFAULT_DM_ROSTER],
  };
}

/** Normalize legacy records missing recruiting action flags. */
export function normalizeWorkflowRecord(
  candidateId: string,
  raw: Partial<CandidateWorkflowRecord> & { candidateId?: string },
): CandidateWorkflowRecord {
  const workflowStatus =
    raw.workflowStatus && isCandidateWorkflowStatus(raw.workflowStatus)
      ? raw.workflowStatus
      : "Needs Review";
  return {
    candidateId,
    workflowStatus,
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    assignedRecruiter: raw.assignedRecruiter?.trim() || "Unassigned",
    assignedDM: raw.assignedDM?.trim() || "Unassigned",
    lastActionAt: raw.lastActionAt ?? null,
    nextActionNeeded:
      raw.nextActionNeeded?.trim() || nextActionForWorkflowStatus(workflowStatus),
    history: Array.isArray(raw.history) ? raw.history : [],
    recruitingActions: {
      ...emptyRecruitingActions(),
      ...(raw.recruitingActions && typeof raw.recruitingActions === "object"
        ? raw.recruitingActions
        : {}),
    },
    followUpDueAt: typeof raw.followUpDueAt === "string" ? raw.followUpDueAt : null,
    snoozedUntil: typeof raw.snoozedUntil === "string" ? raw.snoozedUntil : null,
    signatureRequestId:
      typeof raw.signatureRequestId === "string" ? raw.signatureRequestId : null,
    paperworkTemplateKey:
      typeof raw.paperworkTemplateKey === "string" ? raw.paperworkTemplateKey : null,
    paperworkSentAt: typeof raw.paperworkSentAt === "string" ? raw.paperworkSentAt : null,
    paperworkViewedAt: typeof raw.paperworkViewedAt === "string" ? raw.paperworkViewedAt : null,
    paperworkViewCount:
      typeof raw.paperworkViewCount === "number" && raw.paperworkViewCount >= 0
        ? Math.floor(raw.paperworkViewCount)
        : 0,
    paperworkSignedAt: typeof raw.paperworkSignedAt === "string" ? raw.paperworkSignedAt : null,
    paperworkStatus: normalizePaperworkStatus(raw.paperworkStatus),
    paperworkError: typeof raw.paperworkError === "string" ? raw.paperworkError : null,
    onboardingContactEmail:
      typeof raw.onboardingContactEmail === "string" ? raw.onboardingContactEmail : null,
    directDepositStatus: normalizeDirectDepositStatus(raw.directDepositStatus),
    directDepositRequestedAt:
      typeof raw.directDepositRequestedAt === "string" ? raw.directDepositRequestedAt : null,
    directDepositLastReminderAt:
      typeof raw.directDepositLastReminderAt === "string" ? raw.directDepositLastReminderAt : null,
    directDepositNotes: typeof raw.directDepositNotes === "string" ? raw.directDepositNotes : null,
    directDepositTriggeredByUserId:
      typeof raw.directDepositTriggeredByUserId === "string"
        ? raw.directDepositTriggeredByUserId
        : null,
    directDepositLastDeliveryMode:
      raw.directDepositLastDeliveryMode === "log" || raw.directDepositLastDeliveryMode === "resend"
        ? raw.directDepositLastDeliveryMode
        : null,
    directDepositLastHrCopyIncluded:
      typeof raw.directDepositLastHrCopyIncluded === "boolean"
        ? raw.directDepositLastHrCopyIncluded
        : null,
    directDepositLastHrBccAddress:
      typeof raw.directDepositLastHrBccAddress === "string"
        ? raw.directDepositLastHrBccAddress
        : null,
    recruiterAssignmentSource: isRecruiterAssignmentSource(raw.recruiterAssignmentSource)
      ? raw.recruiterAssignmentSource
      : null,
    recruiterAssignmentReason:
      typeof raw.recruiterAssignmentReason === "string" ? raw.recruiterAssignmentReason : null,
    recruiterAssignmentConfidence:
      typeof raw.recruiterAssignmentConfidence === "number" &&
      Number.isFinite(raw.recruiterAssignmentConfidence)
        ? Math.max(0, Math.min(100, Math.round(raw.recruiterAssignmentConfidence)))
        : null,
    recruiterAssignedAt: typeof raw.recruiterAssignedAt === "string" ? raw.recruiterAssignedAt : null,
    recruiterOwnershipVersion:
      typeof raw.recruiterOwnershipVersion === "number" &&
      Number.isFinite(raw.recruiterOwnershipVersion) &&
      raw.recruiterOwnershipVersion >= 0
        ? Math.floor(raw.recruiterOwnershipVersion)
        : 0,
    requiredAction: typeof raw.requiredAction === "string" ? raw.requiredAction : null,
    actionType: normalizeRecruiterActionType(raw.actionType),
    actionPriority: normalizeRecruiterActionPriority(raw.actionPriority),
    actionReason: typeof raw.actionReason === "string" ? raw.actionReason : null,
    actionDueDate: typeof raw.actionDueDate === "string" ? raw.actionDueDate : null,
    actionConfidence:
      typeof raw.actionConfidence === "number" && Number.isFinite(raw.actionConfidence)
        ? Math.max(0, Math.min(100, Math.round(raw.actionConfidence)))
        : null,
    actionGeneratedAt: typeof raw.actionGeneratedAt === "string" ? raw.actionGeneratedAt : null,
    recommendedStage: typeof raw.recommendedStage === "string" ? raw.recommendedStage : null,
    progressionReason: typeof raw.progressionReason === "string" ? raw.progressionReason : null,
    progressionConfidence:
      typeof raw.progressionConfidence === "number" && Number.isFinite(raw.progressionConfidence)
        ? Math.max(0, Math.min(100, Math.round(raw.progressionConfidence)))
        : null,
    progressionPriority: normalizeRecruiterActionPriority(raw.progressionPriority),
    progressionGeneratedAt:
      typeof raw.progressionGeneratedAt === "string" ? raw.progressionGeneratedAt : null,
    updatedAt: raw.updatedAt ?? new Date(0).toISOString(),
  };
}

const RECRUITER_ACTION_TYPES: RecruiterActionType[] = [
  "assign-recruiter",
  "screen-candidate",
  "needs-review",
  "schedule-interview",
  "send-paperwork",
  "await-signature",
  "follow-up",
  "verify-paperwork",
  "await-dd",
  "load-mel",
  "training",
  "monitor",
  "none",
];

const RECRUITER_ACTION_PRIORITIES: RecruiterActionPriority[] = ["high", "medium", "low"];

export function normalizeRecruiterActionType(value: unknown): RecruiterActionType | null {
  if (typeof value === "string" && RECRUITER_ACTION_TYPES.includes(value as RecruiterActionType)) {
    return value as RecruiterActionType;
  }
  return null;
}

export function normalizeRecruiterActionPriority(value: unknown): RecruiterActionPriority | null {
  if (typeof value === "string" && RECRUITER_ACTION_PRIORITIES.includes(value as RecruiterActionPriority)) {
    return value as RecruiterActionPriority;
  }
  return null;
}

const PAPERWORK_STATUSES: PaperworkStatus[] = [
  "not_sent",
  "sent",
  "viewed",
  "signed",
  "declined",
  "failed",
];

export function normalizePaperworkStatus(value: unknown): PaperworkStatus {
  if (typeof value === "string" && PAPERWORK_STATUSES.includes(value as PaperworkStatus)) {
    return value as PaperworkStatus;
  }
  return "not_sent";
}

export type CandidateWorkflowState = Record<string, CandidateWorkflowRecord>;

export const CANDIDATE_WORKFLOW_STATUSES: CandidateWorkflowStatus[] = [
  "Applied",
  "Needs Review",
  "Qualified",
  "Not Qualified",
  "Operator Approved",
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
];

export function nextActionForWorkflowStatus(status: CandidateWorkflowStatus): string {
  const actions: Record<CandidateWorkflowStatus, string> = {
    Applied: "Review candidate fit",
    "Needs Review": "Review candidate fit",
    Qualified: "Prepare paperwork",
    "Not Qualified": "No action",
    "Operator Approved": "Await Paperwork Needed authorization",
    "Paperwork Needed": "Send onboarding paperwork",
    "Paperwork Sent": "Wait for signature",
    Signed: "Verify signed paperwork",
    "Awaiting DD Verification": "Await direct deposit verification from candidate",
    "Ready for MEL": "Load into MEL",
    "Loaded in MEL": "Monitor placement",
    "Training Needed": "Schedule training",
    "Active Rep": "Monitor field activity",
  };
  return actions[status];
}

export function isCandidateWorkflowStatus(value: string): value is CandidateWorkflowStatus {
  return CANDIDATE_WORKFLOW_STATUSES.includes(value as CandidateWorkflowStatus);
}
