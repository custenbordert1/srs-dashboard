export const P246_PHASE = "P246-outstanding-paperwork-reminders";
export const P246_SUBJECT = "Reminder: Complete Your SRS Onboarding Paperwork";
export const P246_BATCH_SIZE = 25;
export const P246_BATCH_PAUSE_MS = 1500;
export const P246_MAX_REMINDERS = 4;
export const P246_STORE_FILENAME = "p246-reminder-store.json";
export const P246_DASHBOARD_SNAPSHOT_FILENAME = "p246-dashboard-snapshot.json";
export const P246_CONFIRM_LIVE_FLAG = "--confirm-live";

/** Reminder N may fire no sooner than this gap after the prior milestone. */
export const P246_CADENCE_MS = {
  /** Reminder 1: after original paperwork send */
  1: 48 * 60 * 60 * 1000,
  /** Reminder 2: after Reminder 1 */
  2: 3 * 24 * 60 * 60 * 1000,
  /** Reminder 3: after Reminder 2 */
  3: 5 * 24 * 60 * 60 * 1000,
  /** Reminder 4: after Reminder 3 */
  4: 7 * 24 * 60 * 60 * 1000,
} as const;

export type P246ReminderNumber = 1 | 2 | 3 | 4;

/** Live Dropbox Sign statuses used for eligibility. */
export type P246DropboxLiveStatus =
  | "pending"
  | "awaiting_signature"
  | "viewed"
  | "partially_signed"
  | "signed"
  | "complete"
  | "declined"
  | "cancelled"
  | "voided"
  | "expired"
  | "deleted"
  | "invalid"
  | "error"
  | "unknown";

export const P246_ELIGIBLE_DROPBOX_STATUSES = new Set<P246DropboxLiveStatus>([
  "pending",
  "awaiting_signature",
  "viewed",
  "partially_signed",
]);

export const P246_TERMINAL_DROPBOX_STATUSES = new Set<P246DropboxLiveStatus>([
  "signed",
  "complete",
  "declined",
  "cancelled",
  "voided",
  "expired",
  "deleted",
  "invalid",
  "error",
]);

export type P246Disposition =
  | "eligible"
  | "missing_signature_request"
  | "invalid_email"
  | "do_not_contact"
  | "active_in_mel"
  | "signed_or_completed"
  | "declined"
  | "cancelled"
  | "voided"
  | "expired"
  | "deleted"
  | "invalid_packet"
  | "error_status"
  | "test_request"
  | "packet_email_mismatch"
  | "dropbox_status_lookup_failed"
  | "status_unverified"
  | "cooldown_not_met"
  | "recently_reminded"
  | "maximum_reminders_reached"
  | "needs_recruiter_follow_up"
  | "duplicate_reminder_prevented"
  | "duplicate_candidate"
  | "duplicate_packet"
  | "packet_not_outstanding"
  | "not_onboarding_packet"
  | "missing_original_send_date"
  | "signed_before_send"
  | "resend_delivery_failed"
  | "reminder_history_write_failed"
  | "system_configuration_error";

export type P246FailureClass =
  | "dropbox_status_lookup_failed"
  | "status_unverified"
  | "invalid_email"
  | "resend_delivery_failed"
  | "reminder_history_write_failed"
  | "duplicate_reminder_prevented"
  | "signed_before_send"
  | "cooldown_not_met"
  | "maximum_reminders_reached"
  | "active_in_mel"
  | "do_not_contact"
  | "missing_signature_request"
  | "packet_email_mismatch"
  | "system_configuration_error";

export type P246DeliveryStatus =
  | "preview"
  | "sent"
  | "logged_outbox"
  | "failed"
  | "skipped"
  | "blocked_no_mailer";

export type P246ReminderHistoryEntry = {
  candidateId: string;
  signatureRequestId: string;
  reminderNumber: P246ReminderNumber;
  idempotencyKey: string;
  sentAt: string;
  email: string;
  deliveryStatus: P246DeliveryStatus;
  messageId?: string | null;
};

export type P246PacketReminderState = {
  candidateId: string;
  signatureRequestId: string;
  reminderCount: number;
  lastReminderAt: string | null;
  lastReminderNumber: number;
  needsRecruiterFollowUp: boolean;
  needsRecruiterFollowUpAt: string | null;
  history: P246ReminderHistoryEntry[];
  usedIdempotencyKeys: string[];
};

export type P246ReminderStore = {
  version: 2;
  updatedAt: string;
  /** Keyed by candidateId:signatureRequestId */
  byPacketKey: Record<string, P246PacketReminderState>;
};

export type P246CandidateEvaluation = {
  candidateId: string;
  candidateName: string;
  firstName: string;
  email: string | null;
  breezyPosition: string | null;
  breezyStage: string | null;
  workflowStatus: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  dropboxLiveStatus: P246DropboxLiveStatus | null;
  dropboxVerified: boolean;
  originalPaperworkSentAt: string | null;
  lastReminderAt: string | null;
  reminderCount: number;
  nextReminderNumber: P246ReminderNumber | null;
  eligibilityResult: P246Disposition;
  exclusionReason: string | null;
  eligible: boolean;
  idempotencyKey: string | null;
  packetStatusSource: "dropbox" | "none";
  reconciliationNote: string | null;
  statusConflict: boolean;
};

export type P246ReminderSendRecord = {
  candidateId: string;
  candidateName: string;
  email: string;
  signatureRequestId: string;
  dropboxLiveStatus: P246DropboxLiveStatus;
  reminderNumber: P246ReminderNumber;
  idempotencyKey: string;
  reminderTimestamp: string;
  reminderCount: number;
  emailDeliveryStatus: P246DeliveryStatus;
  messageId?: string | null;
  error?: string | null;
  failureClass?: P246FailureClass | null;
};

export type P246Metrics = {
  evaluated: number;
  dropboxVerified: number;
  eligibleReminder1: number;
  eligibleReminder2: number;
  eligibleReminder3: number;
  eligibleReminder4: number;
  eligibleTotal: number;
  signedOrCompleted: number;
  viewedIncomplete: number;
  pendingIncomplete: number;
  partiallySignedIncomplete: number;
  recentlyReminded: number;
  cooldownNotMet: number;
  maximumRemindersReached: number;
  needsRecruiterFollowUp: number;
  missingSignatureRequest: number;
  invalidEmail: number;
  statusConflicts: number;
  dropboxLookupFailures: number;
  statusUnverified: number;
  activeInMel: number;
  doNotContact: number;
  packetEmailMismatch: number;
  otherExclusions: number;
  attempted: number;
  sent: number;
  deliveryFailures: number;
  skipped: number;
};

export type P246MailCapability = {
  mode: "log" | "resend";
  canLiveDeliver: boolean;
  hasResendKey: boolean;
  from: string;
  replyTo: string;
  blocker: string | null;
};

export type P246ReconciliationRecord = {
  candidateId: string;
  candidateName: string;
  signatureRequestId: string | null;
  workflowStatus: string;
  paperworkStatus: string;
  breezyStage: string | null;
  dropboxLiveStatus: P246DropboxLiveStatus | null;
  dropboxVerified: boolean;
  reminderCount: number;
  conflictType:
    | "none"
    | "dropbox_signed_internal_outstanding"
    | "internal_signed_dropbox_outstanding"
    | "missing_signature_request"
    | "lookup_failed"
    | "status_mismatch";
  action:
    | "none"
    | "corrected_internal_to_signed"
    | "flagged_for_investigation"
    | "excluded_missing_request"
    | "excluded_unverified";
  detail: string;
};

export type P246PreviewBuckets = {
  eligibleReminder1: P246CandidateEvaluation[];
  eligibleReminder2: P246CandidateEvaluation[];
  eligibleReminder3: P246CandidateEvaluation[];
  eligibleReminder4: P246CandidateEvaluation[];
  signedOrCompleted: P246CandidateEvaluation[];
  viewedIncomplete: P246CandidateEvaluation[];
  pendingIncomplete: P246CandidateEvaluation[];
  recentlyReminded: P246CandidateEvaluation[];
  maximumRemindersReached: P246CandidateEvaluation[];
  needsRecruiterFollowUp: P246CandidateEvaluation[];
  missingSignatureRequest: P246CandidateEvaluation[];
  invalidEmails: P246CandidateEvaluation[];
  statusConflicts: P246CandidateEvaluation[];
  dropboxLookupFailures: P246CandidateEvaluation[];
  statusUnverified: P246CandidateEvaluation[];
};

export type P246DashboardMetrics = {
  totalOutstandingPaperwork: number;
  pendingSignature: number;
  viewedButNotSigned: number;
  reminder1Due: number;
  reminder2Due: number;
  reminder3Due: number;
  reminder4Due: number;
  maximumRemindersReached: number;
  needsRecruiterFollowUp: number;
  averageDaysSentToSigned: number | null;
  reminderToSignConversionRate: number | null;
  generatedAt: string;
  source: "preview" | "live" | "snapshot";
};

export type P246PreviewReport = {
  phase: typeof P246_PHASE;
  generatedAt: string;
  mode: "preview" | "live";
  mail: P246MailCapability;
  metrics: P246Metrics;
  dashboard: P246DashboardMetrics;
  evaluations: P246CandidateEvaluation[];
  buckets: P246PreviewBuckets;
  reconciliation: P246ReconciliationRecord[];
  wouldSend: Array<{
    candidateId: string;
    candidateName: string;
    email: string;
    signatureRequestId: string;
    reminderNumber: P246ReminderNumber;
    idempotencyKey: string;
    dropboxLiveStatus: P246DropboxLiveStatus;
    subject: string;
    bodyPreview: string;
  }>;
  stopCampaign: boolean;
  stopReason: string | null;
};

export type P246RunResult = {
  preview: P246PreviewReport;
  sent: P246ReminderSendRecord[];
  skips: P246ReminderSendRecord[];
  failures: P246ReminderSendRecord[];
  reconciliation: P246ReconciliationRecord[];
  needsRecruiterFollowUp: P246CandidateEvaluation[];
  liveWritesOccurred: boolean;
  artifacts: {
    previewMd: string;
    previewJson: string;
    sentJson: string;
    skipsJson: string;
    failuresJson: string;
    reconciliationJson: string;
    needsRecruiterFollowUpJson: string;
    finalMd: string;
    finalJson: string;
  };
};
