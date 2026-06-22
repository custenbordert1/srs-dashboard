import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { calendarDaysSince } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

export const CANONICAL_PIPELINE_STAGES = [
  "Applied",
  "Needs Review",
  "Contacted",
  "Interview Scheduled",
  "Interview Completed",
  "Paperwork Pending",
  "Paperwork Sent",
  "Ready for MEL",
  "Active Rep",
] as const;

export type CanonicalPipelineStage = (typeof CANONICAL_PIPELINE_STAGES)[number];

const TERMINAL_STATUSES: CandidateWorkflowStatus[] = ["Not Qualified"];

export const STAGE_SLA_HOURS: Partial<Record<CanonicalPipelineStage, number>> = {
  "Needs Review": 72,
  Contacted: 48,
  "Interview Scheduled": 5 * 24,
  "Interview Completed": 5 * 24,
  "Paperwork Pending": 5 * 24,
  "Paperwork Sent": 5 * 24,
  "Ready for MEL": 3 * 24,
};

function stageIncludes(stage: string, words: string[]): boolean {
  const normalized = stage.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

export function isActivePipelineCandidate(row: ScoredCandidateWorkflowRow): boolean {
  return !TERMINAL_STATUSES.includes(row.workflowStatus);
}

export function mapToCanonicalPipelineStage(row: ScoredCandidateWorkflowRow): CanonicalPipelineStage {
  const { workflowStatus, recruitingActions, lastActionAt, stage } = row;

  if (workflowStatus === "Active Rep") return "Active Rep";
  if (
    workflowStatus === "Ready for MEL" ||
    workflowStatus === "Loaded in MEL" ||
    workflowStatus === "Training Needed"
  ) {
    return "Ready for MEL";
  }
  if (workflowStatus === "Paperwork Sent") return "Paperwork Sent";
  if (
    workflowStatus === "Paperwork Needed" ||
    workflowStatus === "Signed" ||
    workflowStatus === "Awaiting DD Verification"
  ) {
    return "Paperwork Pending";
  }
  if (workflowStatus === "Qualified") {
    if (
      recruitingActions.recommendInterview ||
      (stageIncludes(stage, ["interview"]) && !stageIncludes(stage, ["completed", "done"]))
    ) {
      return "Interview Scheduled";
    }
    return "Interview Completed";
  }
  if (workflowStatus === "Applied") {
    return lastActionAt ? "Contacted" : "Applied";
  }
  if (workflowStatus === "Needs Review") {
    return lastActionAt ? "Contacted" : "Needs Review";
  }
  return "Needs Review";
}

export function canonicalStageIndex(stage: CanonicalPipelineStage): number {
  return CANONICAL_PIPELINE_STAGES.indexOf(stage);
}

export function daysInCanonicalStage(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): number | null {
  const anchor = row.lastActionAt ?? row.appliedDate;
  return calendarDaysSince(anchor, referenceMs);
}

export function isBeyondStageSla(
  stage: CanonicalPipelineStage,
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): boolean {
  const slaHours = STAGE_SLA_HOURS[stage];
  if (!slaHours) return false;
  const days = daysInCanonicalStage(row, referenceMs);
  if (days === null) return false;
  return days * 24 > slaHours;
}
