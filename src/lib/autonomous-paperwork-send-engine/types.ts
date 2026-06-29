import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

export const P84_SOURCE_PHASE = "P84";

export type P84FeatureFlags = {
  enabled: boolean;
  /** When true, P83 advances workflow without approval gate and P84 may call Dropbox Sign. */
  liveMode: boolean;
  /** When false, eligibility is evaluated and audit logged but Dropbox is not called. */
  liveSend: boolean;
  requireApproval: boolean;
  maxSendsPerRun: number;
  monitorSignatures: boolean;
  updatedAt: string;
};

export type PaperworkSendGateId =
  | "recruiter_assigned"
  | "paperwork_needed"
  | "send_paperwork_action"
  | "published_job"
  | "valid_email"
  | "no_duplicate"
  | "not_signed"
  | "not_rejected"
  | "not_inactive"
  | "template_ready"
  | "automation_enabled";

export type PaperworkSendGate = {
  id: PaperworkSendGateId;
  label: string;
  passed: boolean;
  detail: string | null;
};

export type PaperworkSendEligibilityResult = {
  candidateId: string;
  eligible: boolean;
  gates: PaperworkSendGate[];
  blockingReasons: string[];
  templateKey: OnboardingTemplateKey | null;
};

export type PaperworkSendDecision = {
  candidateId: string;
  eligible: boolean;
  shouldSend: boolean;
  reason: string;
  templateKey: OnboardingTemplateKey;
  blockingReasons: string[];
};

export type PaperworkSendAuditEvent = {
  id: string;
  at: string;
  candidateId: string;
  phase: typeof P84_SOURCE_PHASE;
  previousStatus: string;
  newStatus: string;
  reason: string;
  packetId?: string;
  signatureRequestId?: string;
  retryCount?: number;
  error?: string;
  simulated: boolean;
};

export type PaperworkSendRunResult = {
  evaluated: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  retriesScheduled: number;
  signaturesSynced: number;
  readyForWork: number;
  errors: string[];
  warnings: string[];
};

export type PaperworkSendDashboardMetrics = {
  candidatesWaiting: number;
  paperworkSentToday: number;
  awaitingSignatures: number;
  signedToday: number;
  readyForWork: number;
  failures: number;
  retries: number;
  averageSendTimeMs: number | null;
  averageSignatureCompletionMs: number | null;
  liveMode: boolean;
  liveSend: boolean;
};
