import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";
import type { PaperworkApprovalStatus } from "@/lib/executive-paperwork-dashboard/types";

export type ApprovalQueuePriority = "high" | "medium" | "low";

export type ApprovalQueueAgingBucketId = "0-24h" | "24-48h" | "48-72h" | "72h+";

export type ApprovalQueueExceptionFlag =
  | "store-drift"
  | "unassigned-recruiter"
  | "missing-email"
  | "workflow-mismatch"
  | "low-confidence"
  | "low-grade";

export type ApprovalQueueCandidateRow = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  recruiter: string;
  positionName: string;
  positionId: string;
  grade: AiLetterGrade;
  confidenceScore: number;
  queueAgeHours: number | null;
  positionUrgency: CoverageStatus;
  priority: ApprovalQueuePriority;
  priorityScore: number;
  priorityReasons: string[];
  exceptionFlags: ApprovalQueueExceptionFlag[];
  onboardingId: string | null;
  workflowStatus: string;
  hasDrift: boolean;
  driftReason: string | null;
  approvalStatus: PaperworkApprovalStatus | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
};

export type ApprovalQueueRecruiterRollup = {
  recruiter: string;
  queueCount: number;
  averageAgeHours: number | null;
  highPriorityCount: number;
  oldestAgeHours: number | null;
};

export type ApprovalQueueAgingBucket = {
  id: ApprovalQueueAgingBucketId;
  label: string;
  count: number;
};

export type ApprovalQueueExecutiveSummary = {
  totalQueue: number;
  highPriorityCount: number;
  mediumPriorityCount: number;
  lowPriorityCount: number;
  byRecruiter: ApprovalQueueRecruiterRollup[];
  agingBuckets: ApprovalQueueAgingBucket[];
  bottlenecks: string[];
};

export type ApprovalQueueRecruiterGroup = {
  recruiter: string;
  candidates: ApprovalQueueCandidateRow[];
};

export type ApprovalQueueCommandCenter = {
  fetchedAt: string;
  scope: "mtd";
  readOnly: true;
  executiveSummary: ApprovalQueueExecutiveSummary;
  recruiterRollups: ApprovalQueueRecruiterRollup[];
  candidatesByRecruiter: ApprovalQueueRecruiterGroup[];
  highPriority: ApprovalQueueCandidateRow[];
  mediumPriority: ApprovalQueueCandidateRow[];
  lowPriority: ApprovalQueueCandidateRow[];
};

export const APPROVAL_QUEUE_AGING_BUCKET_ORDER: ApprovalQueueAgingBucketId[] = [
  "0-24h",
  "24-48h",
  "48-72h",
  "72h+",
];
