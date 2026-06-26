export const P70_SOURCE_PHASE = "P70";
export const P70_PREVIEW_MODE = true as const;

export const AUTONOMOUS_PAPERWORK_PIPELINE_STAGES = [
  "ai_recruiting_intelligence",
  "candidate_intelligence",
  "recruiter_approval",
  "autonomous_paperwork_engine",
  "production_send_queue",
  "autonomous_onboarding",
  "workforce_placement_intelligence",
  "executive_natural_language_queries",
] as const;

export type PaperworkLifecycleStatus =
  | "eligible"
  | "queued"
  | "generating"
  | "sent"
  | "viewed"
  | "signed"
  | "expired"
  | "failed"
  | "cancelled"
  | "needs_recruiter_review";

export type PaperworkSendSource = "auto" | "manual" | "unknown";

export type PaperworkEligibilityRequirement = {
  id: string;
  label: string;
  complete: boolean;
  blocking: boolean;
  detail: string | null;
};

export type PaperworkAutoEligibilityResult = {
  candidateId: string;
  eligible: boolean;
  status: "ready_for_auto_send" | "needs_recruiter_review";
  requirements: PaperworkEligibilityRequirement[];
  missingReasons: string[];
};

export type PaperworkQueueTimelineEntry = {
  status: string;
  at: string | null;
  detail: string | null;
};

export type PaperworkQueueRow = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  owner: string;
  lifecycleStatus: PaperworkLifecycleStatus;
  lifecycleLabel: string;
  lastActivity: string | null;
  lastActivityAt: string | null;
  elapsedLabel: string | null;
  elapsedHours: number | null;
  retryCount: number;
  sendSource: PaperworkSendSource;
  recommendedAction: string | null;
  timeline: PaperworkQueueTimelineEntry[];
};

export type RecruiterPaperworkMetricsRow = {
  recruiter: string;
  manualSends: number;
  autoSends: number;
  signed: number;
  pending: number;
  failed: number;
  averageSignTimeHours: number | null;
};

export type PaperworkTodayActivityCard = {
  paperworkSentToday: number;
  autoSentToday: number;
  manualSentToday: number;
  signedToday: number;
  pendingSignature: number;
  expired: number;
  failed: number;
  averageTimeToSignHours: number | null;
  lastPacketSentAt: string | null;
};

export type PaperworkAutomationReadiness = {
  readyForAutoSend: number;
  blocked: number;
  blockReasons: Array<{ reason: string; count: number }>;
};

export type PaperworkExecutiveMetrics = {
  todaysSends: number;
  todaysSignatures: number;
  weeklySendTrend: number;
  averageTimeToSignHours: number | null;
  autoSendPercent: number | null;
  manualSendPercent: number | null;
  failureRate: number | null;
  pendingOver24Hours: number;
  pendingOver48Hours: number;
  pendingOver72Hours: number;
};

export type AutonomousPaperworkDashboardSnapshot = {
  previewMode: true;
  sourcePhase: typeof P70_SOURCE_PHASE;
  fetchedAt: string;
  todayActivity: PaperworkTodayActivityCard;
  recruiterMetrics: RecruiterPaperworkMetricsRow[];
  candidateQueue: PaperworkQueueRow[];
  automationReadiness: PaperworkAutomationReadiness;
  executiveMetrics: PaperworkExecutiveMetrics;
  waitingTooLong: PaperworkQueueRow[];
  failedPackets: PaperworkQueueRow[];
};

export type AutonomousPaperworkPreviewResult = {
  ok: true;
  previewMode: typeof P70_PREVIEW_MODE;
  fetchedAt: string;
  dashboard: AutonomousPaperworkDashboardSnapshot;
  warnings: string[];
};
