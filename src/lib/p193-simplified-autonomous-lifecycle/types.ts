export const P193_SIMPLIFIED_SOURCE_PHASE = "P193-Simplified" as const;
export const P193_SIMPLIFIED_SCHEMA_VERSION = 1 as const;

/** Primary production lifecycle for the simplified autonomous pipeline. */
export const P193_LIFECYCLE_STATES = [
  "Applied",
  "AI Reviewing",
  "Qualified",
  "Paperwork Sent",
  "Awaiting Signature",
  "Signed",
  "Ready For Assignment",
  "Needs Human Review",
  "Rejected",
  "Hold",
  "Expired",
] as const;

export type P193LifecycleState = (typeof P193_LIFECYCLE_STATES)[number];

export const P193_DASHBOARD_CARDS = [
  "New Applicants",
  "AI Reviewing",
  "Qualified",
  "Paperwork Pending",
  "Viewed",
  "Signed",
  "Ready For Assignment",
  "Needs Human Review",
  "Expired",
] as const;

export type P193DashboardCard = (typeof P193_DASHBOARD_CARDS)[number];

export type P193AiDecision = "Qualified" | "Needs Human Review" | "Not Qualified";

export type P193PaperworkEnvelopeStatus =
  | "not_sent"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"
  | "failed";

/** Metadata — never promoted to lifecycle states. */
export type P193CandidateMetadata = {
  questionnaireScore: number | null;
  resumeScore: number | null;
  experienceYears: number | null;
  distanceToNearestWorkMiles: number | null;
  nearbyJobs: Array<{ jobId: string; title: string; distanceMiles: number | null }>;
  phoneVerified: boolean;
  emailVerified: boolean;
  paperworkStatus: P193PaperworkEnvelopeStatus;
  reminderCount: number;
  lastReminderAt: string | null;
  lastViewedAt: string | null;
  lastStatusChangeAt: string | null;
  signatureTimestamp: string | null;
  confidenceScore: number | null;
  aiDecision: P193AiDecision | null;
  aiSummary: string | null;
  fraudSpamScore: number | null;
  duplicateSuspect: boolean;
  historicalApplicant: boolean;
  latitude: number | null;
  longitude: number | null;
  availableProjects: Array<{ projectId: string; title: string }>;
  /** Optional audit only — not lifecycle gates. */
  recommendedHireAudit: string | null;
  operatorApprovalAudit: string | null;
  recruiterAssignmentAudit: string | null;
};

export type P193TimelineEvent = {
  at: string;
  state: P193LifecycleState | "AI Reviewed";
  detail: string;
};

export type P193LifecycleRecord = {
  candidateId: string;
  state: P193LifecycleState;
  previousState: P193LifecycleState | null;
  enteredAt: string;
  updatedAt: string;
  metadata: P193CandidateMetadata;
  timeline: P193TimelineEvent[];
  /** Legacy shadow pointers (read-only references). */
  legacyWorkflowStatus: string | null;
  legacyP186State: string | null;
  version: number;
};

export type P193ReminderPlan = {
  candidateId: string;
  action: "none" | "reminder_1h" | "reminder_24h" | "reminder_48h" | "expire_7d";
  due: boolean;
  reason: string;
  reminderCount: number;
  wouldMutate: boolean;
};

export type P193Flags = {
  /** Master switch — default false. Never auto-enable in production. */
  enabled: boolean;
  /** Allow AI Review → Qualified auto-transition. */
  aiAutoQualifyEnabled: boolean;
  /** Project Qualified → legacy Paperwork Needed + P192 evidence markers. */
  paperworkBridgeEnabled: boolean;
  /** Send Dropbox/email reminders (default false). */
  reminderSendEnabled: boolean;
  /** Advance Signed → Ready For Assignment automatically. */
  readyForAssignmentEnabled: boolean;
};

export const DEFAULT_P193_FLAGS: P193Flags = {
  enabled: false,
  aiAutoQualifyEnabled: false,
  paperworkBridgeEnabled: false,
  reminderSendEnabled: false,
  readyForAssignmentEnabled: false,
};

export function emptyMetadata(overrides: Partial<P193CandidateMetadata> = {}): P193CandidateMetadata {
  return {
    questionnaireScore: null,
    resumeScore: null,
    experienceYears: null,
    distanceToNearestWorkMiles: null,
    nearbyJobs: [],
    phoneVerified: false,
    emailVerified: false,
    paperworkStatus: "not_sent",
    reminderCount: 0,
    lastReminderAt: null,
    lastViewedAt: null,
    lastStatusChangeAt: null,
    signatureTimestamp: null,
    confidenceScore: null,
    aiDecision: null,
    aiSummary: null,
    fraudSpamScore: null,
    duplicateSuspect: false,
    historicalApplicant: false,
    latitude: null,
    longitude: null,
    availableProjects: [],
    recommendedHireAudit: null,
    operatorApprovalAudit: null,
    recruiterAssignmentAudit: null,
    ...overrides,
  };
}

export const P193_FORBIDDEN_ACTIONS = [
  "mel_export",
  "mel_api",
  "automatic_project_assignment",
  "duplicate_paperwork",
  "duplicate_reminders",
  "duplicate_packets",
  "modify_p184_core",
  "modify_p191_core",
  "modify_p192_core",
] as const;
