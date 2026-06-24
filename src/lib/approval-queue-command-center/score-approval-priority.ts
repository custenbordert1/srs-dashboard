import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";
import type {
  ApprovalQueueExceptionFlag,
  ApprovalQueuePriority,
} from "@/lib/approval-queue-command-center/types";

const GRADE_SCORE: Record<AiLetterGrade, number> = {
  "A+": 25,
  A: 22,
  B: 15,
  C: 8,
  D: 3,
};

const HIGH_PRIORITY_THRESHOLD = 55;
const MEDIUM_PRIORITY_THRESHOLD = 35;

export function gradePriorityScore(grade: AiLetterGrade): number {
  return GRADE_SCORE[grade] ?? 0;
}

export function resolveConfidenceScore(row: ScoredCandidateWorkflowRow): number {
  if (row.actionConfidence != null) {
    return Math.round(Math.min(20, Math.max(0, row.actionConfidence * 20)));
  }
  if (row.matchPercent > 0) {
    return Math.round(Math.min(20, row.matchPercent / 5));
  }
  return Math.round(Math.min(20, row.aiNumericScore / 5));
}

export function positionUrgencyBoost(status: CoverageStatus): number {
  if (status === "Critical") return 15;
  if (status === "At Risk") return 10;
  if (status === "Watch") return 5;
  return 0;
}

export function queueAgeBoost(ageHours: number | null): number {
  if (ageHours == null) return 0;
  if (ageHours >= 72) return 20;
  if (ageHours >= 48) return 15;
  if (ageHours >= 24) return 10;
  return Math.min(8, Math.round(ageHours / 3));
}

export function recruiterWorkloadBoost(queueCount: number): number {
  if (queueCount >= 100) return 12;
  if (queueCount >= 50) return 8;
  if (queueCount >= 20) return 4;
  return 0;
}

export function intelligenceSignalBoost(row: ScoredCandidateWorkflowRow): number {
  let boost = 0;
  if (row.isTopMatch) boost += 4;
  if (row.matchLevel === "high") boost += 3;
  if (row.actionPriority === "high") boost += 5;
  else if (row.actionPriority === "medium") boost += 2;
  if (row.aiRecommendations.includes("Send paperwork")) boost += 2;
  return boost;
}

export function resolveExceptionFlags(input: {
  row: ScoredCandidateWorkflowRow;
  hasDrift: boolean;
  confidenceScore: number;
}): ApprovalQueueExceptionFlag[] {
  const flags: ApprovalQueueExceptionFlag[] = [];
  if (input.hasDrift) flags.push("store-drift");
  if (!input.row.assignedRecruiter?.trim() || input.row.assignedRecruiter.toLowerCase() === "unassigned") {
    flags.push("unassigned-recruiter");
  }
  if (!input.row.email?.trim()) flags.push("missing-email");
  if (
    input.row.workflowStatus === "Applied" &&
    (input.row.paperworkStatus === "sent" || input.row.paperworkStatus === "viewed")
  ) {
    flags.push("workflow-mismatch");
  }
  if (input.confidenceScore < 8) flags.push("low-confidence");
  if (input.row.aiGrade === "D" || input.row.aiGrade === "C") flags.push("low-grade");
  return flags;
}

export function scoreApprovalPriority(input: {
  row: ScoredCandidateWorkflowRow;
  queueAgeHours: number | null;
  positionUrgency: CoverageStatus;
  recruiterQueueCount: number;
  hasDrift: boolean;
}): {
  priorityScore: number;
  priority: ApprovalQueuePriority;
  confidenceScore: number;
  priorityReasons: string[];
  exceptionFlags: ApprovalQueueExceptionFlag[];
} {
  const confidenceScore = resolveConfidenceScore(input.row);
  const gradeScore = gradePriorityScore(input.row.aiGrade);
  const ageScore = queueAgeBoost(input.queueAgeHours);
  const urgencyScore = positionUrgencyBoost(input.positionUrgency);
  const workloadScore = recruiterWorkloadBoost(input.recruiterQueueCount);
  const intelligenceScore = intelligenceSignalBoost(input.row);

  const priorityScore = gradeScore + confidenceScore + ageScore + urgencyScore + workloadScore + intelligenceScore;
  const priority: ApprovalQueuePriority =
    priorityScore >= HIGH_PRIORITY_THRESHOLD
      ? "high"
      : priorityScore >= MEDIUM_PRIORITY_THRESHOLD
        ? "medium"
        : "low";

  const priorityReasons: string[] = [];
  if (gradeScore >= 20) priorityReasons.push(`Grade ${input.row.aiGrade}`);
  if (confidenceScore >= 14) priorityReasons.push("High confidence");
  if (ageScore >= 10) priorityReasons.push("Aging in queue");
  if (urgencyScore >= 10) priorityReasons.push(`${input.positionUrgency} position urgency`);
  if (workloadScore >= 8) priorityReasons.push("Recruiter queue bottleneck");
  if (intelligenceScore >= 5) priorityReasons.push("Strong recruiting intelligence signals");
  if (priorityReasons.length === 0) priorityReasons.push("Standard queue priority");

  const exceptionFlags = resolveExceptionFlags({
    row: input.row,
    hasDrift: input.hasDrift,
    confidenceScore,
  });

  return {
    priorityScore,
    priority,
    confidenceScore,
    priorityReasons,
    exceptionFlags,
  };
}
