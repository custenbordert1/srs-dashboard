import type { AutopilotRecommendationKind } from "@/lib/recruiting-autopilot/types";
import type { AutomationRoiView } from "@/lib/executive-trust-roi/types";
import type { AutomationQueueAgingBucket } from "@/lib/recruiting-automation-actions/queue-aging";

/** Safety modes — only draft-only and requires-approval are enabled initially. */
export type AutomationSafetyMode = "draft-only" | "requires-approval" | "auto-execute-allowed";

export type AutomationApprovalStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Executing"
  | "Completed"
  | "Failed"
  | "Cancelled";

export type AutomationActionType =
  | "job-refresh"
  | "create-posting"
  | "follow-up-campaign"
  | "manual-task";

export type FollowUpCampaignType =
  | "stalled-candidate"
  | "previous-applicant"
  | "former-worker"
  | "incomplete-onboarding"
  | "interview-no-response";

export type OutreachMethod = "email" | "text" | "call" | "manual";

export type AutomationPriority = "critical" | "high" | "medium" | "low";

export type JobRefreshDraftPayload = {
  title: string;
  location: string;
  project: string | null;
  reason: string;
  expectedApplicantGain: number;
  priority: AutomationPriority;
  timing: string;
  jobId?: string | null;
};

export type PostingDraftPayload = {
  title: string;
  city: string;
  state: string;
  project: string | null;
  pay: string | null;
  radius: number;
  priority: AutomationPriority;
  coverageImpact: string;
  territory: string | null;
};

export type CampaignCandidateEntry = {
  candidateId: string;
  candidateName: string;
  city: string | null;
  state: string | null;
};

export type FollowUpCampaignDraftPayload = {
  campaignType: FollowUpCampaignType;
  candidates: CampaignCandidateEntry[];
  reason: string;
  message: string;
  outreachMethod: OutreachMethod;
  owner: string;
  expectedPlacements: number;
  expectedCoverageGain: number;
};

export type ManualTaskDraftPayload = {
  title: string;
  description: string;
  assignee: string;
  dueDate: string | null;
};

export type AutomationDraftPayload =
  | JobRefreshDraftPayload
  | PostingDraftPayload
  | FollowUpCampaignDraftPayload
  | ManualTaskDraftPayload;

export type SourceRecommendationRef = {
  recommendationId: string;
  recommendationType: AutopilotRecommendationKind | string;
  source: "autopilot" | "daily-action" | "alert" | "forecast" | "candidate-recovery" | "manual";
  label: string;
};

export type AutomationAuditLogEntry = {
  id: string;
  automationId: string;
  action:
    | "created"
    | "edited"
    | "submitted"
    | "approved"
    | "executed"
    | "failed"
    | "cancelled"
    | "completed"
    | "preview";
  userId: string;
  userName: string;
  timestamp: string;
  before: Partial<RecruitingAutomationRecord> | null;
  after: Partial<RecruitingAutomationRecord> | null;
  note: string | null;
  sourceRecommendationId: string | null;
};

export type RecruitingAutomationRecord = {
  id: string;
  actionType: AutomationActionType;
  owner: string;
  reason: string;
  expectedImpact: string;
  sourceRecommendation: SourceRecommendationRef | null;
  approvalStatus: AutomationApprovalStatus;
  executionStatus: AutomationApprovalStatus;
  payload: AutomationDraftPayload;
  territory: string | null;
  dmName: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  executedBy: string | null;
  executedAt: string | null;
  failureReason: string | null;
  cancelledAt: string | null;
  auditLog: AutomationAuditLogEntry[];
};

export type AutomationRoiGeneratedSummary = {
  applicantsGained: number;
  coverageGained: number;
  placementsInfluenced: number;
};

export type AutomationControlCenterSummary = {
  draft: number;
  pendingApproval: number;
  approved: number;
  executing: number;
  completed: number;
  failed: number;
  cancelled: number;
  recommended: number;
  /** Completed + Failed — terminal execution outcomes. */
  executedCount: number;
  executionSuccessRate: number;
  roiGenerated: AutomationRoiGeneratedSummary;
};

export type AutomationControlCenterSnapshot = {
  generatedAt: string;
  safetyMode: AutomationSafetyMode;
  summary: AutomationControlCenterSummary;
  recommended: RecruitingAutomationRecord[];
  jobRefreshDrafts: RecruitingAutomationRecord[];
  postingDrafts: RecruitingAutomationRecord[];
  followUpCampaigns: RecruitingAutomationRecord[];
  pendingApproval: RecruitingAutomationRecord[];
  approved: RecruitingAutomationRecord[];
  executed: RecruitingAutomationRecord[];
  failed: RecruitingAutomationRecord[];
  cancelled: RecruitingAutomationRecord[];
  all: RecruitingAutomationRecord[];
  automationRoiById: Record<string, AutomationRoiView>;
  queueAging: AutomationQueueAgingBucket[];
};

export const DEFAULT_AUTOMATION_SAFETY_MODE: AutomationSafetyMode = "requires-approval";

export const ENABLED_AUTOMATION_SAFETY_MODES: AutomationSafetyMode[] = [
  "draft-only",
  "requires-approval",
];
