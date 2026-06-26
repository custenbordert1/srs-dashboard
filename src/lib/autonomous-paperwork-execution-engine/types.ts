import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

export const P71_SOURCE_PHASE = "P71";
export const P71_DEFAULT_AUTOMATION_ENABLED = false;
export const P71_DEFAULT_EXECUTION_MODE = "preview" as const;

export type PaperworkExecutionMode = "off" | "preview" | "pilot" | "production";

export type P71FeatureFlags = {
  automationEnabled: boolean;
  executionMode: PaperworkExecutionMode;
  dropboxExecution: boolean;
  pilotRecruiters: string[];
  pilotDistrictManagers: string[];
  pilotTerritories: string[];
  pilotMarkets: string[];
  pilotStates: string[];
  pilotClients: string[];
  pilotProjects: string[];
  updatedAt: string;
};

export type PaperworkExecutionQueueStatus =
  | "queued"
  | "sending"
  | "sent"
  | "waiting_signature"
  | "completed"
  | "cancelled"
  | "failed";

export type PaperworkExecutionQueueItem = {
  queueId: string;
  candidateId: string;
  candidateName: string;
  recruiter: string;
  districtManager: string | null;
  market: string | null;
  state: string | null;
  client: string | null;
  project: string | null;
  templateKey: OnboardingTemplateKey;
  templateLabel: string;
  createdAt: string;
  scheduledAt: string | null;
  executionAt: string | null;
  attempts: number;
  maxAttempts: number;
  executionMode: PaperworkExecutionMode;
  effectiveMode: PaperworkExecutionMode;
  status: PaperworkExecutionQueueStatus;
  blockingReasons: string[];
  wouldExecute: boolean;
};

export type PaperworkExecutionEligibilityRequirement = {
  id: string;
  label: string;
  complete: boolean;
  blocking: boolean;
  detail: string | null;
};

export type PaperworkExecutionEligibilityResult = {
  candidateId: string;
  eligible: boolean;
  status: "ready_for_execution" | "manual_review";
  requirements: PaperworkExecutionEligibilityRequirement[];
  blockingReasons: string[];
  templateKey: OnboardingTemplateKey | null;
  effectiveExecutionMode: PaperworkExecutionMode;
};

export type PaperworkExecutionAuditEvent = {
  auditId: string;
  timestamp: string;
  trigger: string;
  executionMode: PaperworkExecutionMode;
  actor: "system" | "user" | "preview_simulator";
  candidateId: string;
  queueId: string | null;
  packetId: string | null;
  durationMs: number | null;
  result: "simulated" | "success" | "failure" | "skipped" | "blocked";
  failureReason: string | null;
  retryCount: number;
  detail: string | null;
  simulated: boolean;
};

export type PaperworkExecutionTimelineStep = {
  id: string;
  label: string;
  at: string;
  detail: string | null;
  status: "completed" | "pending" | "failed" | "simulated";
};

export type PaperworkExecutionExecutiveMetrics = {
  autoSendsToday: number;
  manualSendsToday: number;
  waitingSignature: number;
  completedToday: number;
  failedToday: number;
  averageSendTimeMs: number | null;
  automationSuccessPercent: number | null;
  retryCount: number;
  queueDepth: number;
  oldestWaitingPacketAt: string | null;
  recruiterTimeSavedMinutes: number | null;
  packetsSentThisWeek: number;
  failureRate: number | null;
  retryRate: number | null;
  autoVsManualAutoPercent: number | null;
  queueWaitTimeMs: number | null;
};

export type PaperworkExecutionAutomationControls = {
  automationEnabled: boolean;
  executionMode: PaperworkExecutionMode;
  dropboxExecution: boolean;
  pilotSummary: string;
  canExecute: boolean;
  previewOnly: boolean;
};

export type AutonomousPaperworkExecutionDashboardSnapshot = {
  sourcePhase: typeof P71_SOURCE_PHASE;
  fetchedAt: string;
  controls: PaperworkExecutionAutomationControls;
  featureFlags: P71FeatureFlags;
  executiveMetrics: PaperworkExecutionExecutiveMetrics;
  executionQueue: PaperworkExecutionQueueItem[];
  blockedCandidates: PaperworkExecutionEligibilityResult[];
  readyCandidates: PaperworkExecutionEligibilityResult[];
  recentAuditEvents: PaperworkExecutionAuditEvent[];
  sampleTimeline: PaperworkExecutionTimelineStep[];
  warnings: string[];
};

export type AutonomousPaperworkExecutionPreviewResult = {
  ok: true;
  previewMode: true;
  fetchedAt: string;
  dashboard: AutonomousPaperworkExecutionDashboardSnapshot;
  warnings: string[];
};
