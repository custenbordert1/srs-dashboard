import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";
import type { CandidateSlaSnapshot, SlaSeverity } from "@/lib/candidate-action-sla";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { RecruiterActionPriority } from "@/lib/recruiter-action-engine/types";

export type RecruiterPriorityLevel = "high" | "medium" | "low";

export type RecruiterPriorityResult = {
  priorityScore: number;
  priorityLevel: RecruiterPriorityLevel;
  priorityReasons: string[];
};

/** Shared inputs for unified recruiter work-item scoring. */
export type RecruiterPriorityInput = {
  row: ScoredCandidateWorkflowRow;
  sla?: CandidateSlaSnapshot;
  queueAgeHours?: number | null;
  positionUrgency?: CoverageStatus;
  recruiterQueueCount?: number;
  recruiterWorkload?: number;
  probabilityOfHire?: number | null;
  actionDueDate?: string | null;
  actionPriority?: RecruiterActionPriority | null;
  actionOverdue?: boolean;
  referenceMs?: number;
};

export type QueuePriorityContext = {
  row: ScoredCandidateWorkflowRow;
  sla: CandidateSlaSnapshot;
};

export type ApprovalPriorityContext = {
  row: ScoredCandidateWorkflowRow;
  queueAgeHours: number | null;
  positionUrgency: CoverageStatus;
  recruiterQueueCount: number;
  hasDrift?: boolean;
};

export type InboxPriorityContext = {
  row: ScoredCandidateWorkflowRow;
  sectionScore: number;
};

export { type AiLetterGrade, type SlaSeverity };
