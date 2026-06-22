import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { resolveBottleneckSeverity } from "@/lib/pipeline-intelligence/bottleneck-engine";
import type { PipelineSlaEntry } from "@/lib/pipeline-intelligence/types";
import {
  CANONICAL_PIPELINE_STAGES,
  daysInCanonicalStage,
  isActivePipelineCandidate,
  isBeyondStageSla,
  mapToCanonicalPipelineStage,
  STAGE_SLA_HOURS,
  type CanonicalPipelineStage,
} from "@/lib/pipeline-intelligence/stage-mapping";

export const SLA_TRACKING_STAGES: Array<{
  stage: CanonicalPipelineStage;
  label: string;
}> = [
  { stage: "Needs Review", label: "Review > 72h" },
  { stage: "Contacted", label: "Contact > 48h" },
  { stage: "Interview Scheduled", label: "Interview > 5d" },
  { stage: "Paperwork Pending", label: "Paperwork > 5d" },
  { stage: "Ready for MEL", label: "Ready For MEL > 3d" },
];

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function slaRecommendation(stage: CanonicalPipelineStage, count: number, severity: string): string | null {
  if (severity === "normal" || count === 0) return null;
  if (stage === "Needs Review") {
    return "Assign recruiter review capacity or redistribute unreviewed candidates.";
  }
  if (stage === "Contacted") {
    return "Prioritize recruiter follow-up and clear contact backlog today.";
  }
  if (stage === "Interview Scheduled") {
    return "Schedule pending interviews or reassign interview-ready candidates.";
  }
  if (stage === "Paperwork Pending") {
    return "Send or chase outstanding paperwork to unblock hiring.";
  }
  if (stage === "Ready for MEL") {
    return "Load qualified candidates into MEL or escalate MEL onboarding support.";
  }
  return "Review stalled candidates and assign ownership.";
}

function candidatesInSlaStage(
  candidates: ScoredCandidateWorkflowRow[],
  stage: CanonicalPipelineStage,
): ScoredCandidateWorkflowRow[] {
  if (stage === "Interview Scheduled") {
    return candidates.filter((row) => {
      const mapped = mapToCanonicalPipelineStage(row);
      return mapped === "Interview Scheduled" || mapped === "Interview Completed";
    });
  }
  if (stage === "Paperwork Pending") {
    return candidates.filter((row) => {
      const mapped = mapToCanonicalPipelineStage(row);
      return mapped === "Paperwork Pending" || mapped === "Paperwork Sent";
    });
  }
  return candidates.filter((row) => mapToCanonicalPipelineStage(row) === stage);
}

export function buildSlaTracking(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): PipelineSlaEntry[] {
  const active = candidates.filter(isActivePipelineCandidate);

  return SLA_TRACKING_STAGES.map(({ stage, label }) => {
    const stageCandidates = candidatesInSlaStage(active, stage);
    const days: number[] = [];
    let beyondSlaCount = 0;

    for (const row of stageCandidates) {
      const mapped = mapToCanonicalPipelineStage(row);
      const rowDays = daysInCanonicalStage(row, referenceMs);
      if (rowDays !== null) days.push(rowDays);
      if (isBeyondStageSla(mapped, row, referenceMs)) beyondSlaCount += 1;
    }

    const avgDaysInStage = average(days);
    const severity = resolveBottleneckSeverity({
      stage,
      count: stageCandidates.length,
      avgDaysInStage,
      beyondSlaCount,
    });

    return {
      stage,
      label,
      slaHours: STAGE_SLA_HOURS[stage] ?? 0,
      count: stageCandidates.length,
      beyondSlaCount,
      avgDaysInStage,
      severity,
      recommendation: slaRecommendation(stage, stageCandidates.length, severity),
    };
  });
}

/** Paperwork SLA also applies to Paperwork Sent — surfaced under paperwork row only. */
export function paperworkSlaStages(): CanonicalPipelineStage[] {
  return CANONICAL_PIPELINE_STAGES.filter(
    (stage) => stage === "Paperwork Pending" || stage === "Paperwork Sent",
  );
}
