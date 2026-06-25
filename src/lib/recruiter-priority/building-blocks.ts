import type { AiLetterGrade } from "@/lib/candidate-ai-scoring";
import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";
import type { SlaSeverity } from "@/lib/candidate-action-sla";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { APPROVAL_GRADE_SCORE } from "@/lib/recruiter-priority/constants";

export function gradePriorityScore(grade: AiLetterGrade): number {
  return APPROVAL_GRADE_SCORE[grade] ?? 0;
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

export function slaSeverityBoost(severity: SlaSeverity): number {
  if (severity === "critical") return 20;
  if (severity === "warn") return 10;
  return 0;
}

export function resolvePriorityLevel(
  priorityScore: number,
  highThreshold: number,
  mediumThreshold: number,
): "high" | "medium" | "low" {
  if (priorityScore >= highThreshold) return "high";
  if (priorityScore >= mediumThreshold) return "medium";
  return "low";
}
