export type CandidateOnboardingMode = "disabled" | "semi-automatic" | "automatic";

export type OnboardingPacketStatus =
  | "draft"
  | "pending_approval"
  | "sent"
  | "viewed"
  | "partially_completed"
  | "completed"
  | "declined"
  | "expired"
  | "failed"
  | "ready_for_mel";

export type CandidateOnboardingPolicy = {
  enabled: boolean;
  mode: CandidateOnboardingMode;
  dryRun: boolean;
  send: { enabled: boolean; requireApproval: boolean };
  reminders: { enabled: boolean };
  escalation: { enabled: boolean; requireApproval: boolean };
  maxEscalationsPerRun: number;
  maxSendsPerRun: number;
  maxRetries: number;
  reminderHours: number[];
  escalationOverdueHours: number;
  updatedAt: string;
};

export type OnboardingStatusHistoryEntry = {
  at: string;
  status: OnboardingPacketStatus;
  detail?: string;
};

export type CandidateOnboardingRecord = {
  onboardingId: string;
  orchestratorRunId?: string;
  candidateId: string;
  signatureRequestId?: string;
  status: OnboardingPacketStatus;
  paperworkComplete: boolean;
  readyForMel: boolean;
  actionType?: string;
  createdAt: string;
  sentAt?: string;
  completedAt?: string;
  failedAt?: string;
  retryCount: number;
  failureReason?: string;
  reminderStage?: number;
  escalated: boolean;
  statusHistory: OnboardingStatusHistoryEntry[];
};

export type CandidateOnboardingDecision = {
  candidateId: string;
  decisionType: "send-packet" | "sync-status" | "reminder" | "escalate" | "mark-ready-for-mel";
  reason: string;
  signatureRequestId?: string;
};

export type CandidateOnboardingRunSummary = {
  runAt: string;
  orchestratorRunId?: string;
  dryRun: boolean;
  eligibleForPaperwork: number;
  packetsSent: number;
  blockedByPolicy: number;
  blockedByBatchCap: number;
  remindersCreated: number;
  escalationsCreated: number;
  readyForMelCount: number;
};

export type CandidateOnboardingResult = {
  ok: boolean;
  dryRun: boolean;
  eligibleForPaperwork: number;
  packetsSent: number;
  statusSynced: number;
  remindersCreated: number;
  escalationsCreated: number;
  readyForMelCount: number;
  blockedByPolicy: number;
  blockedByBatchCap: number;
  skipped: number;
  errors: string[];
  warnings: string[];
};

export type CandidateOnboardingHealth = {
  eligibleForPaperwork: number;
  packetsPending: number;
  packetsSentToday: number;
  completionRatePct: number;
  averageCompletionHours: number | null;
  overduePackets: number;
  escalations: number;
  readyForMelCount: number;
  policyEnabled: boolean;
  policyMode: CandidateOnboardingMode;
  dryRun: boolean;
  executed: number;
  blockedByPolicy: number;
  blockedByBatchCap: number;
  lastRunAt: string | null;
};
