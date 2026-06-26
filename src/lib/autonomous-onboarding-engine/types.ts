export const P67_SOURCE_PHASE = "P67";
export const P67_1_SOURCE_PHASE = "P67.1";
export const P67_SOURCE_MODULE = "autonomous-onboarding-engine";
export const P67_PREVIEW_MODE = true as const;

/** Post-paperwork onboarding lifecycle states (deterministic state machine). */
export type AutonomousOnboardingState =
  | "paperwork_pending"
  | "paperwork_sent"
  | "paperwork_signed"
  | "welcome_prepared"
  | "training_assigned"
  | "training_in_progress"
  | "training_complete"
  | "ready_for_work"
  | "assigned"
  | "archived";

export type AutonomousOnboardingStateLabel = {
  id: AutonomousOnboardingState;
  label: string;
  description: string;
};

export const AUTONOMOUS_ONBOARDING_STATE_LABELS: AutonomousOnboardingStateLabel[] = [
  { id: "paperwork_pending", label: "Paperwork Pending", description: "Awaiting paperwork send or signature." },
  { id: "paperwork_sent", label: "Paperwork Sent", description: "Packet sent — awaiting candidate signature." },
  { id: "paperwork_signed", label: "Paperwork Signed", description: "Paperwork complete — onboarding automation eligible." },
  { id: "welcome_prepared", label: "Welcome Prepared", description: "Welcome email drafted (preview only)." },
  { id: "training_assigned", label: "Training Assigned", description: "Training modules assigned (preview)." },
  { id: "training_in_progress", label: "Training In Progress", description: "Candidate working through training." },
  { id: "training_complete", label: "Training Complete", description: "All required training modules complete." },
  { id: "ready_for_work", label: "Ready For Work", description: "All onboarding requirements satisfied." },
  { id: "assigned", label: "Assigned", description: "Representative assigned to project work." },
  { id: "archived", label: "Archived", description: "Onboarding closed or candidate disqualified." },
];

export type AutonomousOnboardingTransition = {
  from: AutonomousOnboardingState;
  to: AutonomousOnboardingState;
  trigger: string;
  auditable: true;
};

export type TrainingModuleStatus = "not_assigned" | "assigned" | "in_progress" | "complete" | "blocked";

export type TrainingModuleKey = string;

export type TrainingModuleDefinition = {
  key: TrainingModuleKey;
  label: string;
  description: string;
  /** Env var holding the module URL (resolved at preview time). */
  urlEnvVar: string;
  requiredForReadyForWork: boolean;
  sortOrder: number;
  category: "survey" | "course" | "acknowledgement" | "other";
};

export type TrainingModulePreview = {
  module: TrainingModuleDefinition;
  url: string | null;
  status: TrainingModuleStatus;
  assignedAt: string | null;
  completedAt: string | null;
  completionPercent: number | null;
};

export type TrainingAssignmentPreview = {
  candidateId: string;
  modules: TrainingModulePreview[];
  allRequiredComplete: boolean;
  assignedCount: number;
  completeCount: number;
};

export type WelcomeEmailPreview = {
  candidateId: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  recipientEmail: string | null;
  replyTo: string;
  trainingLinks: Array<{ label: string; url: string | null }>;
  nextSteps: string[];
  previewOnly: true;
};

export type ReadyForWorkRequirement = {
  id: string;
  label: string;
  complete: boolean;
  blocking: boolean;
  detail: string | null;
};

export type ReadyForWorkReadiness = {
  candidateId: string;
  status: "ready_for_work" | "missing_requirements";
  requirements: ReadyForWorkRequirement[];
  missingRequirementLabels: string[];
  readyAt: string | null;
};

export type AutomationHookStatus = "defined" | "preview" | "disabled";

export type AutomationHookDefinition = {
  id: string;
  label: string;
  description: string;
  triggerState: AutonomousOnboardingState;
  nextHookId: string | null;
  status: AutomationHookStatus;
  previewOnly: true;
};

export type OnboardingStepPreview = {
  id: string;
  label: string;
  complete: boolean;
  current: boolean;
  detail: string | null;
};

export type OnboardingTimelineEntry = {
  id: string;
  at: string;
  label: string;
  detail: string | null;
  state: AutonomousOnboardingState | null;
};

export type OnboardingActivityStatus = "completed" | "current" | "waiting";

export type OnboardingActivityTimelineEntry = {
  id: string;
  at: string | null;
  label: string;
  stepName: string;
  status: OnboardingActivityStatus;
  detail: string | null;
};

export type OnboardingLastActivity = {
  label: string;
  stepName: string;
  completedAt: string;
  elapsedLabel: string | null;
  elapsedMs: number;
};

export type OnboardingStallLevel = "normal" | "needs_attention" | "high_risk" | "blocked";

export type OnboardingStallAssessment = {
  level: OnboardingStallLevel;
  label: string;
  reason: string;
  inactiveMs: number | null;
};

export type OnboardingProgressStepPreview = {
  id: string;
  label: string;
  kind: "lifecycle" | "training";
  complete: boolean;
  current: boolean;
};

export type OnboardingProgressSummary = {
  progressPercent: number;
  completedCount: number;
  totalSteps: number;
  progressBar: string;
  steps: OnboardingProgressStepPreview[];
};

export type OnboardingExecutiveProgressMetrics = {
  totalOnboarding: number;
  averageProgressPct: number;
  averageTimeBetweenStepsHours: number | null;
  candidatesWaiting: number;
  candidatesBlocked: number;
  readyForWorkToday: number;
  averageDaysToReady: number | null;
};

export type OnboardingReminderPreview = {
  id: string;
  label: string;
  scheduledFor: string;
  channel: "email" | "sms" | "task";
  previewOnly: true;
};

export type OnboardingWorkspaceCandidateSnapshot = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  assignedRecruiter: string;
  previewMode: true;
  currentState: AutonomousOnboardingState;
  currentStateLabel: string;
  completedSteps: OnboardingStepPreview[];
  remainingSteps: OnboardingStepPreview[];
  training: TrainingAssignmentPreview;
  welcomeEmail: WelcomeEmailPreview | null;
  readiness: ReadyForWorkReadiness;
  progress: OnboardingProgressSummary;
  lastActivity: OnboardingLastActivity | null;
  activityTimeline: OnboardingActivityTimelineEntry[];
  stall: OnboardingStallAssessment;
  nextStepLabel: string;
  nextPlannedAutomation: AutomationHookDefinition | null;
  timeline: OnboardingTimelineEntry[];
  upcomingAutomations: AutomationHookDefinition[];
  reminderSchedule: OnboardingReminderPreview[];
};

export type AutonomousOnboardingKpis = {
  inPipeline: number;
  paperworkSent: number;
  paperworkSigned: number;
  welcomePrepared: number;
  trainingAssigned: number;
  trainingInProgress: number;
  readyForWork: number;
  assigned: number;
  archived: number;
};

export type AutonomousOnboardingDashboardSnapshot = {
  fetchedAt: string;
  scope: "mtd";
  previewMode: true;
  phase: typeof P67_SOURCE_PHASE;
  module: typeof P67_SOURCE_MODULE;
  kpis: AutonomousOnboardingKpis;
  progressMetrics: OnboardingExecutiveProgressMetrics;
  stalledCandidates: Array<{
    candidateId: string;
    candidateName: string;
    stall: OnboardingStallAssessment;
    progressPercent: number;
    lastActivity: OnboardingLastActivity | null;
  }>;
  stateDistribution: Partial<Record<AutonomousOnboardingState, number>>;
  automationHooks: AutomationHookDefinition[];
  candidates: OnboardingWorkspaceCandidateSnapshot[];
  sampleCandidateId: string | null;
};

export type AutonomousOnboardingPreviewResult = {
  ok: true;
  previewMode: true;
  fetchedAt: string;
  dashboard: AutonomousOnboardingDashboardSnapshot;
  warnings: string[];
};

export type OnboardingPreviewCandidateInput = {
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  appliedDate: string;
  workflowStatus: string;
  paperworkStatus: string;
  paperworkError?: string | null;
  paperworkSentAt?: string | null;
  paperworkSignedAt?: string | null;
  signatureRequestId?: string | null;
  assignedRecruiter: string;
};

export type ResolveOnboardingStateInput = {
  candidateId: string;
  workflowStatus: string;
  paperworkStatus: string;
  paperworkError?: string | null;
  onboardingStatus?: string | null;
  trainingComplete?: boolean;
  acknowledgementsComplete?: boolean;
};
