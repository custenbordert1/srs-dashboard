import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildCandidateAgingSummary } from "@/lib/pipeline-intelligence/aging";
import { buildPipelineBottleneckRecommendations } from "@/lib/pipeline-intelligence/accountability-recommendations";
import { buildExecutivePipelineHealth } from "@/lib/pipeline-intelligence/executive-pipeline";
import { buildFunnelTransitionMetrics } from "@/lib/pipeline-intelligence/funnel-conversion";
import { buildRecruiterPipelinePerformance } from "@/lib/pipeline-intelligence/recruiter-performance";
import { buildSlaTracking } from "@/lib/pipeline-intelligence/sla-tracking";
import { buildStageMetrics } from "@/lib/pipeline-intelligence/conversion";
import {
  buildPipelineBottlenecks,
  buildTerritoryFunnels,
} from "@/lib/pipeline-intelligence/territory-funnel";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/types";

export function buildPipelineIntelligenceSnapshot(
  candidates: ScoredCandidateWorkflowRow[],
  generatedAt?: string,
): PipelineIntelligenceSnapshot {
  const referenceIso = generatedAt ?? new Date().toISOString();
  const referenceMs = new Date(referenceIso).getTime();

  const stages = buildStageMetrics(candidates, referenceMs);
  const funnelTransitions = buildFunnelTransitionMetrics(candidates, referenceMs);
  const slaTracking = buildSlaTracking(candidates, referenceMs);
  const territories = buildTerritoryFunnels(candidates, referenceMs);
  const bottlenecks = buildPipelineBottlenecks(territories);
  const recommendations = buildPipelineBottleneckRecommendations(bottlenecks);
  const recruiters = buildRecruiterPipelinePerformance(candidates, referenceMs);

  return {
    generatedAt: referenceIso,
    stages,
    funnelTransitions,
    slaTracking,
    territories,
    recruiters,
    aging: buildCandidateAgingSummary(candidates, referenceMs),
    executive: buildExecutivePipelineHealth({
      territories,
      bottlenecks,
      candidates,
      recruiters,
      referenceMs,
    }),
    bottlenecks,
    recommendations,
  };
}
