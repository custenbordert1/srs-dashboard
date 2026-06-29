import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

export const P80_PREVIEW_MODE = true as const;

export type OnboardingPipelineStage =
  | "paperwork_complete"
  | "welcome_email_ready"
  | "mel_test_assigned"
  | "store_call_assigned"
  | "training_pending"
  | "ready_for_work";

export type OnboardingPipelinePreviewActionKind =
  | "welcome_email"
  | "mel_test_assignment"
  | "store_call_assignment"
  | "training_reminder"
  | "dm_notification";

export type OnboardingPipelinePreviewAction = {
  id: string;
  kind: OnboardingPipelinePreviewActionKind;
  label: string;
  description: string;
  previewOnly: true;
  status: "ready" | "scheduled" | "blocked";
  detail: string | null;
};

export type OnboardingPipelineRecruiterAction = {
  id: string;
  label: string;
  description: string;
  priority: "low" | "medium" | "high";
  previewOnly: true;
};

export type OnboardingPipelineTimelineEntry = {
  id: OnboardingPipelineStage;
  label: string;
  status: "completed" | "current" | "upcoming";
  at: string | null;
  detail: string | null;
};

export type OnboardingPipelineRecord = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  assignedRecruiter: string;
  stage: OnboardingPipelineStage;
  stageLabel: string;
  progressPercent: number;
  completedStages: OnboardingPipelineStage[];
  timeline: OnboardingPipelineTimelineEntry[];
  stalled: boolean;
  stallReason: string | null;
  previewActions: OnboardingPipelinePreviewAction[];
  recruiterActions: OnboardingPipelineRecruiterAction[];
  paperworkSignedAt: string | null;
  previewMode: typeof P80_PREVIEW_MODE;
};

export type OnboardingPipelineExecutiveSummary = {
  totalRecords: number;
  readyForWorkCount: number;
  stalledCount: number;
  averageProgressPercent: number;
};

export type OnboardingPipelineDashboardSnapshot = {
  fetchedAt: string;
  previewMode: typeof P80_PREVIEW_MODE;
  summary: OnboardingPipelineExecutiveSummary;
  records: OnboardingPipelineRecord[];
  stalledRecords: OnboardingPipelineRecord[];
};

export type OnboardingPipelinePreviewResult = {
  ok: true;
  previewMode: typeof P80_PREVIEW_MODE;
  fetchedAt: string;
  dashboard: OnboardingPipelineDashboardSnapshot;
  warnings: string[];
};

export type OnboardingPipelineCandidateInput = {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  fetchedAt?: string;
};
