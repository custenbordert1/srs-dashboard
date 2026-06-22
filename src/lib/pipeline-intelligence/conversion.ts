import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { PipelineStageMetric } from "@/lib/pipeline-intelligence/types";
import { resolveBottleneckSeverity } from "@/lib/pipeline-intelligence/bottleneck-engine";
import {
  buildFunnelTransitionMetrics,
  FUNNEL_GROUP_STAGES,
  FUNNEL_TRANSITIONS,
} from "@/lib/pipeline-intelligence/funnel-conversion";
import {
  CANONICAL_PIPELINE_STAGES,
  daysInCanonicalStage,
  isActivePipelineCandidate,
  isBeyondStageSla,
  mapToCanonicalPipelineStage,
  type CanonicalPipelineStage,
} from "@/lib/pipeline-intelligence/stage-mapping";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function funnelGroupForStage(stage: CanonicalPipelineStage): number {
  for (let index = 0; index < FUNNEL_GROUP_STAGES.length; index += 1) {
    if (FUNNEL_GROUP_STAGES[index]!.includes(stage)) return index;
  }
  return -1;
}

function conversionForStage(
  stage: CanonicalPipelineStage,
  transitions: ReturnType<typeof buildFunnelTransitionMetrics>,
): number | null {
  const group = funnelGroupForStage(stage);
  const transition = FUNNEL_TRANSITIONS.find((row) => row.fromGroup === group);
  if (!transition) return null;
  return transitions.find((row) => row.id === transition.id)?.conversionPct ?? null;
}

export function buildStageMetrics(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): PipelineStageMetric[] {
  const transitions = buildFunnelTransitionMetrics(candidates, referenceMs);
  const byStage = new Map<
    CanonicalPipelineStage,
    { count: number; days: number[]; beyondSla: number }
  >();
  for (const stage of CANONICAL_PIPELINE_STAGES) {
    byStage.set(stage, { count: 0, days: [], beyondSla: 0 });
  }

  for (const row of candidates) {
    if (!isActivePipelineCandidate(row)) continue;
    const stage = mapToCanonicalPipelineStage(row);
    const bucket = byStage.get(stage)!;
    bucket.count += 1;
    const days = daysInCanonicalStage(row, referenceMs);
    if (days !== null) bucket.days.push(days);
    if (isBeyondStageSla(stage, row, referenceMs)) bucket.beyondSla += 1;
  }

  return CANONICAL_PIPELINE_STAGES.map((stage) => {
    const bucket = byStage.get(stage)!;
    const avgDaysInStage = average(bucket.days);
    const bottleneckSeverity = resolveBottleneckSeverity({
      stage,
      count: bucket.count,
      avgDaysInStage,
      beyondSlaCount: bucket.beyondSla,
    });

    return {
      stage,
      count: bucket.count,
      conversionToNextPct: conversionForStage(stage, transitions),
      avgDaysInStage,
      beyondSlaCount: bucket.beyondSla,
      bottleneckSeverity,
    };
  });
}

export { buildFunnelTransitionMetrics };
