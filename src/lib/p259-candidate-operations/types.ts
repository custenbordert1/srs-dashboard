import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import type {
  HiringScoreReason,
  HiringWorkspaceApplicantRow,
} from "@/lib/p258-hiring-workspace";

/** Row actions available on every applicant in the operations center. */
export type CandidateOpsActionId =
  | "review"
  | "send_paperwork"
  | "reminder"
  | "open_breezy"
  | "open_dropbox"
  | "move_stage"
  | "assign_recruiter"
  | "assign_dm"
  | "email"
  | "call"
  | "sms"
  | "copy_email"
  | "copy_phone"
  | "history";

export type CandidateOpsActionKind = "read" | "preview" | "write" | "external" | "clipboard";

export type CandidateOpsActionDef = {
  id: CandidateOpsActionId;
  label: string;
  kind: CandidateOpsActionKind;
  /** Write / preview actions always require an explicit confirm modal. */
  requiresConfirm: boolean;
  /** True when this action may call an existing production write API after confirm. */
  mayWrite: boolean;
  description: string;
};

export type CandidateOpsQuickFilterId =
  | "only_ready"
  | "needs_recruiter"
  | "needs_dm"
  | "needs_paperwork"
  | "viewed"
  | "signed"
  | "distance_gt_40"
  | "distance_lt_20"
  | "missing_phone"
  | "missing_email"
  | "incomplete_identity";

export type CandidateOpsBadgeTone = "neutral" | "good" | "warn" | "bad" | "info";

export type CandidateOpsIntelligenceBadge = {
  id: string;
  label: string;
  value: string;
  tone: CandidateOpsBadgeTone;
  detail: string;
};

export type CandidateOpsIntelligence = {
  hiringScore: number;
  hiringScoreReasons: HiringScoreReason[];
  probabilityToSign: number;
  probabilityToComplete: number;
  estimatedDaysToHire: number | null;
  distanceMiles: number | null;
  coverageBand: "within" | "review" | "outside" | "unknown";
  duplicateRisk: "none" | "low" | "high";
  missingInformation: string[];
  badges: CandidateOpsIntelligenceBadge[];
};

export type CandidateOpsCommunicationKind =
  | "email"
  | "reminder"
  | "manual_email"
  | "sms"
  | "phone_note"
  | "operator_note"
  | "workflow"
  | "paperwork";

export type CandidateOpsCommunicationItem = {
  id: string;
  kind: CandidateOpsCommunicationKind;
  title: string;
  detail: string;
  at: string | null;
  sparse?: boolean;
};

export type CandidateOpsPaperworkPanel = {
  candidateId: string;
  dropboxStatus: string;
  template: string;
  envelopeId: string | null;
  viewed: boolean;
  viewedAt: string | null;
  signed: boolean;
  signedAt: string | null;
  reminderCount: number;
  sentDate: string | null;
  expiration: string | null;
  error: string | null;
  /** Buttons are preview/confirm only unless a future hook is wired. */
  actions: Array<{
    id: "preview_email" | "send_paperwork" | "send_reminder" | "resend" | "view_envelope" | "download_audit";
    label: string;
    requiresConfirm: boolean;
    liveWired: boolean;
    disabled: boolean;
    disabledReason?: string;
  }>;
};

export type CandidateOpsWorkflowStage = {
  id: CandidateWorkflowStatus | "Archived";
  label: string;
  current: boolean;
};

export type CandidateOpsApplicant = HiringWorkspaceApplicantRow & {
  intelligence: CandidateOpsIntelligence;
  communications: CandidateOpsCommunicationItem[];
  paperworkPanel: CandidateOpsPaperworkPanel;
  workflowStages: CandidateOpsWorkflowStage[];
};

export type CandidateOpsBulkActionId =
  | "assign_recruiter"
  | "assign_dm"
  | "preview_paperwork"
  | "preview_reminder"
  | "export";

export type CandidateOpsBulkActionDef = {
  id: CandidateOpsBulkActionId;
  label: string;
  requiresConfirm: true;
  /** Bulk send is never allowed in P259. */
  allowsSend: false;
  mayWrite: boolean;
  description: string;
};

export type CandidateOpsConfirmIntent =
  | {
      type: "assign_recruiter";
      candidateIds: string[];
      recruiter: string;
    }
  | {
      type: "assign_dm";
      candidateIds: string[];
      dm: string;
    }
  | {
      type: "move_stage";
      candidateId: string;
      fromStatus: CandidateWorkflowStatus;
      toStatus: CandidateWorkflowStatus;
    }
  | {
      type: "preview_paperwork";
      candidateIds: string[];
    }
  | {
      type: "preview_reminder";
      candidateIds: string[];
    }
  | {
      type: "send_paperwork_preview";
      candidateId: string;
    }
  | {
      type: "send_paperwork_live";
      candidateId: string;
      requiresTypedConfirm: boolean;
      typedConfirmReasons: string[];
    }
  | {
      type: "send_reminder_preview";
      candidateId: string;
    }
  | {
      type: "resend_preview";
      candidateId: string;
    }
  | {
      type: "export";
      candidateIds: string[];
    };

export type CandidateOpsWritePolicy = {
  autoWrites: false;
  bulkSends: false;
  backgroundActions: false;
  operatorInitiatedOnly: true;
  paperworkSendMode: "live_confirm_one_at_a_time";
  reminderMode: "preview_confirm_only";
  /** Live writes allowed only after explicit confirm via existing APIs. */
  allowedLiveWrites: Array<"assign_recruiter" | "assign_dm" | "move_stage" | "send_paperwork">;
};

export const CANDIDATE_OPS_WRITE_POLICY: CandidateOpsWritePolicy = {
  autoWrites: false,
  bulkSends: false,
  backgroundActions: false,
  operatorInitiatedOnly: true,
  paperworkSendMode: "live_confirm_one_at_a_time",
  reminderMode: "preview_confirm_only",
  allowedLiveWrites: ["assign_recruiter", "assign_dm", "move_stage", "send_paperwork"],
};

/* -------------------------------------------------------------------------- */
/* Future hooks — interfaces only (P260 / P261 / P262). Do not implement.     */
/* -------------------------------------------------------------------------- */

/** P260 — Live Paperwork Send (wired via Job Command Center API). */
export interface P260LivePaperworkSendHook {
  readonly id: "p260_live_paperwork_send";
  readonly wired: true;
  readonly apiPath: "/api/recruiting/job-command-center/send-paperwork";
  previewSend(input: {
    candidateId: string;
    templateKey: string;
    recipientEmail: string;
  }): Promise<{ ok: true; previewId: string } | { ok: false; error: string }>;
  executeLiveSend(input: {
    candidateId: string;
    confirmationPhrase: string;
    typedConfirmation?: string;
    operatorConfirmed: true;
  }): Promise<{ ok: boolean; signatureRequestId?: string; error?: string }>;
}

/** P261 — Reminder Engine (interface only). */
export interface P261ReminderEngineHook {
  readonly id: "p261_reminder_engine";
  readonly wired: false;
  previewReminder(input: {
    candidateId: string;
    channel: "email" | "sms";
  }): Promise<{ ok: true; previewId: string; bodyPreview: string } | { ok: false; error: string }>;
  /**
   * Must never be called from P259 UI. Reserved for future confirmed reminder sends.
   */
  executeReminder?(input: {
    candidateId: string;
    previewId: string;
    operatorConfirmed: true;
  }): Promise<{ ok: boolean; error?: string }>;
}

/** P262 — Recruiting Inbox (interface only). */
export interface P262RecruitingInboxHook {
  readonly id: "p262_recruiting_inbox";
  readonly wired: false;
  listThreads?(candidateId: string): Promise<
    Array<{
      threadId: string;
      channel: "email" | "sms" | "note";
      subject: string;
      lastAt: string | null;
    }>
  >;
  composeDraft?(input: {
    candidateId: string;
    channel: "email" | "sms";
    body: string;
  }): Promise<{ draftId: string }>;
}

export type CandidateOpsFutureHooks = {
  paperworkSend: P260LivePaperworkSendHook;
  reminderEngine: P261ReminderEngineHook;
  recruitingInbox: P262RecruitingInboxHook;
};
