import type { OnboardingPacketStatus } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";

export type ExecutivePaperworkStageId =
  | "approvalQueue"
  | "sent"
  | "viewed"
  | "signed"
  | "failed"
  | "expired"
  | "awaitingRecruiterAction";

export type PaperworkApprovalStatus = "pending" | "approved" | "not_required";

export type PaperworkSourceOfTruth = "workflow" | "onboarding" | "reconciled";

export type ExecutivePaperworkKpiStrip = {
  mtdCandidates: number;
  inPipeline: number;
  approvalQueue: number;
  sent: number;
  viewed: number;
  signed: number;
  failed: number;
  expired: number;
  awaitingRecruiterAction: number;
  driftCount: number;
  policyRequireApproval: boolean;
};

export type ApprovalQueueRecruiterRollup = {
  recruiter: string;
  count: number;
  oldestAgeHours: number | null;
};

export type ExecutivePaperworkCandidateRow = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  recruiter: string;
  stage: ExecutivePaperworkStageId;
  ageInStageHours: number | null;
  signatureRequestId: string | null;
  exceptionReason: string | null;
  onboardingId: string | null;
  onboardingStatus: OnboardingPacketStatus | null;
  workflowPaperworkStatus: PaperworkStatus;
  workflowStatus: string;
  hasDrift: boolean;
  driftReason: string | null;
  sourceOfTruth: PaperworkSourceOfTruth;
  approvalStatus: PaperworkApprovalStatus | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
};

export type ExecutivePaperworkStageCard = {
  id: ExecutivePaperworkStageId;
  label: string;
  count: number;
  rows: ExecutivePaperworkCandidateRow[];
};

export type ExecutivePaperworkDashboard = {
  fetchedAt: string;
  scope: "mtd";
  kpiStrip: ExecutivePaperworkKpiStrip;
  stages: ExecutivePaperworkStageCard[];
  approvalQueueRecruiterRollup: ApprovalQueueRecruiterRollup[];
  driftRows: ExecutivePaperworkCandidateRow[];
};

export const EXECUTIVE_PAPERWORK_STAGE_LABELS: Record<ExecutivePaperworkStageId, string> = {
  approvalQueue: "Approval Queue",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  failed: "Failed",
  expired: "Expired",
  awaitingRecruiterAction: "Awaiting Recruiter Action",
};

export const EXECUTIVE_PAPERWORK_STAGE_ORDER: ExecutivePaperworkStageId[] = [
  "approvalQueue",
  "sent",
  "viewed",
  "signed",
  "failed",
  "expired",
  "awaitingRecruiterAction",
];
