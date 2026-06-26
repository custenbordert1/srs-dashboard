export const P73_SOURCE_PHASE = "P73";
export const P73_PREVIEW_MODE = true as const;
export const P73_DEFAULT_COMMUNICATION_ENABLED = false;
export const P73_DEFAULT_EXECUTION_MODE = "preview" as const;

export type CommunicationExecutionMode = "off" | "preview" | "pilot" | "production";

export type CommunicationRecipientRole =
  | "representative"
  | "recruiter"
  | "district_manager"
  | "executive"
  | "operations";

export type CommunicationChannel = "email" | "sms" | "internal";

export type CommunicationEventType =
  | "application_received"
  | "interview_invitation"
  | "interview_reminder"
  | "recruiter_follow_up"
  | "candidate_inactivity_reminder"
  | "paperwork_ready"
  | "paperwork_sent"
  | "reminder_24h"
  | "reminder_48h"
  | "final_reminder"
  | "paperwork_completed"
  | "welcome_email"
  | "training_instructions"
  | "mel_survey_assignment"
  | "store_call_assignment"
  | "ready_for_work_confirmation"
  | "new_representative_ready"
  | "representative_completed_onboarding"
  | "representative_overdue"
  | "representative_failed_onboarding"
  | "daily_communication_summary"
  | "failed_communication_alerts"
  | "communication_health_metrics";

export type CommunicationQueueStatus =
  | "queued"
  | "ready"
  | "waiting_approval"
  | "sent_preview"
  | "failed"
  | "cancelled"
  | "skipped";

export type P73FeatureFlags = {
  communicationEnabled: boolean;
  executionMode: CommunicationExecutionMode;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pilotRecruiters: string[];
  pilotDistrictManagers: string[];
  pilotTerritories: string[];
  pilotMarkets: string[];
  pilotStates: string[];
  pilotClients: string[];
  pilotProjects: string[];
  updatedAt: string;
};

export type CommunicationTemplateVariables = {
  firstName: string;
  lastName: string;
  candidateName: string;
  recruiter: string;
  districtManager: string;
  project: string;
  store: string;
  market: string;
  surveyLink: string;
  trainingLink: string;
  paperworkLink: string;
  currentStatus: string;
  queue: string;
};

export type CommunicationPreviewTemplate = {
  templateId: string;
  communicationType: CommunicationEventType;
  channel: CommunicationChannel;
  subject: string;
  body: string;
  mergeFields: Array<keyof CommunicationTemplateVariables>;
};

export type CommunicationDecision = {
  decisionId: string;
  candidateId: string | null;
  candidateName: string | null;
  communicationType: CommunicationEventType;
  recipientRole: CommunicationRecipientRole;
  recipientLabel: string;
  templateId: string;
  channel: CommunicationChannel;
  scheduledAt: string;
  approvalRequired: boolean;
  skipped: boolean;
  skipReason: string | null;
  explanation: string;
  trigger: string;
  effectiveMode: CommunicationExecutionMode;
  wouldSend: boolean;
};

export type CommunicationQueueItem = {
  queueId: string;
  candidateId: string | null;
  candidateName: string | null;
  communicationType: CommunicationEventType;
  recipientRole: CommunicationRecipientRole;
  recipientLabel: string;
  templateId: string;
  templateSubject: string;
  scheduledAt: string;
  status: CommunicationQueueStatus;
  executionMode: CommunicationExecutionMode;
  effectiveMode: CommunicationExecutionMode;
  approvalRequired: boolean;
  explanation: string;
  wouldExecute: boolean;
};

export type CommunicationAuditEvent = {
  auditId: string;
  timestamp: string;
  trigger: string;
  candidateId: string | null;
  candidateName: string | null;
  communicationType: CommunicationEventType;
  recipientRole: CommunicationRecipientRole;
  recipientLabel: string;
  templateId: string;
  executionMode: CommunicationExecutionMode;
  automation: boolean;
  previewStatus: CommunicationQueueStatus;
  failureReason: string | null;
  detail: string | null;
  simulated: boolean;
};

export type CommunicationTimelineStep = {
  id: string;
  at: string;
  label: string;
  communicationType: CommunicationEventType | null;
  detail: string | null;
  status: "completed" | "pending" | "scheduled" | "simulated";
};

export type CommunicationHealthMetrics = {
  communicationsToday: number;
  queued: number;
  previewSent: number;
  waitingApproval: number;
  failures: number;
  skipped: number;
  averageResponseTimeMs: number | null;
  templatesUsed: number;
  automationPercent: number | null;
  topCommunicationTypes: Array<{ type: CommunicationEventType; count: number }>;
  recruiterWorkEliminated: number;
};

export type CommunicationAutomationControls = {
  communicationEnabled: boolean;
  executionMode: CommunicationExecutionMode;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pilotSummary: string;
  canExecute: boolean;
  previewOnly: boolean;
};

export type AutonomousCandidateCommunicationDashboardSnapshot = {
  sourcePhase: typeof P73_SOURCE_PHASE;
  previewMode: typeof P73_PREVIEW_MODE;
  fetchedAt: string;
  controls: CommunicationAutomationControls;
  health: CommunicationHealthMetrics;
  queue: CommunicationQueueItem[];
  recentAudit: CommunicationAuditEvent[];
  sampleTimeline: CommunicationTimelineStep[];
  leadershipSummary: string;
  warnings: string[];
};

export type CandidateCommunicationPreviewSnapshot = {
  candidateId: string;
  candidateName: string;
  decisions: CommunicationDecision[];
  queue: CommunicationQueueItem[];
  timeline: CommunicationTimelineStep[];
  audit: CommunicationAuditEvent[];
};

export type AutonomousCandidateCommunicationPreviewResult = {
  ok: true;
  previewMode: typeof P73_PREVIEW_MODE;
  fetchedAt: string;
  dashboard: AutonomousCandidateCommunicationDashboardSnapshot;
  candidate: CandidateCommunicationPreviewSnapshot | null;
  warnings: string[];
};
