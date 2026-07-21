export const P245_PHASE = "P245-onboarding-paperwork-reminders";
export const P245_SUBJECT = "Reminder: Complete Your SRS Onboarding Paperwork";
export const P245_BATCH_SIZE = 25;
export const P245_BATCH_PAUSE_MS = 1500;
export const P245_REMINDER_COOLDOWN_MS = 48 * 60 * 60 * 1000;
export const P245_STORE_FILENAME = "p245-reminder-store.json";
export const P245_CONFIRM_LIVE_FLAG = "--confirm-live";

export type P245PacketStatus =
  | "Pending Signature"
  | "Viewed"
  | "Signed"
  | "Declined"
  | "Expired"
  | "Cancelled"
  | "Voided"
  | "Unknown";

export type P245SkipReason =
  | "eligible"
  | "not_paperwork_sent"
  | "missing_signature_request"
  | "already_signed"
  | "declined"
  | "expired"
  | "cancelled"
  | "voided"
  | "invalid_email"
  | "active_in_mel"
  | "do_not_contact"
  | "recently_reminded"
  | "packet_not_outstanding";

export type P245DeliveryStatus =
  | "preview"
  | "sent"
  | "logged_outbox"
  | "failed"
  | "skipped"
  | "blocked_no_mailer";

export type P245ReminderHistoryEntry = {
  candidateId: string;
  sentAt: string;
  email: string;
  signatureRequestId: string;
  deliveryStatus: P245DeliveryStatus;
  messageId?: string | null;
};

export type P245ReminderStore = {
  version: 1;
  updatedAt: string;
  byCandidateId: Record<
    string,
    {
      reminderCount: number;
      lastReminderAt: string | null;
      history: P245ReminderHistoryEntry[];
    }
  >;
};

export type P245CandidateEvaluation = {
  candidateId: string;
  candidateName: string;
  firstName: string;
  email: string | null;
  signatureRequestId: string | null;
  workflowStatus: string;
  paperworkStatus: string;
  packetStatus: P245PacketStatus;
  packetStatusSource: "dropbox" | "workflow" | "none";
  eligible: boolean;
  skipReason: P245SkipReason;
  skipDetail: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
};

export type P245ReminderSendRecord = {
  candidateId: string;
  candidateName: string;
  email: string;
  signatureRequestId: string;
  packetStatus: P245PacketStatus;
  reminderTimestamp: string;
  reminderCount: number;
  emailDeliveryStatus: P245DeliveryStatus;
  messageId?: string | null;
  error?: string | null;
};

export type P245Metrics = {
  evaluated: number;
  eligible: number;
  sent: number;
  alreadySigned: number;
  recentlyReminded: number;
  invalidEmail: number;
  deliveryFailures: number;
  missingSignatureRequest: number;
  activeInMel: number;
  doNotContact: number;
  notPaperworkSent: number;
  packetNotOutstanding: number;
  declined: number;
  expired: number;
  cancelledOrVoided: number;
};

export type P245MailCapability = {
  mode: "log" | "resend";
  canLiveDeliver: boolean;
  hasResendKey: boolean;
  from: string;
  replyTo: string;
  blocker: string | null;
};

export type P245PreviewReport = {
  phase: typeof P245_PHASE;
  generatedAt: string;
  mode: "preview" | "live";
  mail: P245MailCapability;
  metrics: P245Metrics;
  eligible: P245CandidateEvaluation[];
  skippedSample: P245CandidateEvaluation[];
  wouldSend: Array<{
    candidateId: string;
    candidateName: string;
    email: string;
    signatureRequestId: string;
    packetStatus: P245PacketStatus;
    subject: string;
    bodyPreview: string;
  }>;
};

export type P245RunResult = {
  preview: P245PreviewReport;
  sent: P245ReminderSendRecord[];
  failures: P245ReminderSendRecord[];
  artifacts: {
    previewMd: string;
    previewJson: string;
    sentJson: string;
    failuresJson: string;
  };
};
