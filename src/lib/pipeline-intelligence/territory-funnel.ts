import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { DISTRICT_MANAGERS, getAssignedStatesForDm, getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { severityRank } from "@/lib/pipeline-intelligence/bottleneck-engine";
import { buildStageMetrics } from "@/lib/pipeline-intelligence/conversion";
import type { PipelineBottleneck, TerritoryPipelineFunnel } from "@/lib/pipeline-intelligence/types";
import { territoryLabelForDm } from "@/lib/pipeline-intelligence/territory-labels";
import {
  CANONICAL_PIPELINE_STAGES,
  STAGE_SLA_HOURS,
  isActivePipelineCandidate,
  type CanonicalPipelineStage,
} from "@/lib/pipeline-intelligence/stage-mapping";

export function buildTerritoryFunnels(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): TerritoryPipelineFunnel[] {
  return DISTRICT_MANAGERS.map((dmName) => {
    const states = getAssignedStatesForDm(dmName);
    const stateSet = new Set(states);
    const territoryCandidates = candidates.filter((row) =>
      stateSet.has(normalizeStateCode(row.state)),
    );
    const active = territoryCandidates.filter(isActivePipelineCandidate);
    const stages = buildStageMetrics(active, referenceMs);

    let topBottleneck: PipelineBottleneck | null = null;
    for (const stageMetric of stages) {
      if (stageMetric.bottleneckSeverity === "normal" || stageMetric.count === 0) continue;
      const candidate: PipelineBottleneck = {
        territoryLabel: territoryLabelForDm(dmName),
        dmName,
        stage: stageMetric.stage,
        severity: stageMetric.bottleneckSeverity,
        count: stageMetric.count,
        avgDaysInStage: stageMetric.avgDaysInStage,
        slaHours: STAGE_SLA_HOURS[stageMetric.stage] ?? 0,
        message: `${stageMetric.count} candidates stalled in ${stageMetric.stage}`,
      };
      if (!topBottleneck || severityRank(candidate.severity) > severityRank(topBottleneck.severity)) {
        topBottleneck = candidate;
      }
    }

    return {
      territoryLabel: territoryLabelForDm(dmName),
      dmName,
      states,
      stages,
      totalActive: active.length,
      topBottleneck,
    };
  }).sort((a, b) => b.totalActive - a.totalActive || a.dmName.localeCompare(b.dmName));
}

export function buildPipelineBottlenecks(
  territories: TerritoryPipelineFunnel[],
): PipelineBottleneck[] {
  const bottlenecks: PipelineBottleneck[] = [];
  for (const territory of territories) {
    for (const stageMetric of territory.stages) {
      if (stageMetric.bottleneckSeverity === "normal" || stageMetric.count === 0) continue;
      bottlenecks.push({
        territoryLabel: territory.territoryLabel,
        dmName: territory.dmName,
        stage: stageMetric.stage,
        severity: stageMetric.bottleneckSeverity,
        count: stageMetric.count,
        avgDaysInStage: stageMetric.avgDaysInStage,
        slaHours: STAGE_SLA_HOURS[stageMetric.stage] ?? 0,
        message: `${stageMetric.count} candidates in ${stageMetric.stage} · avg ${stageMetric.avgDaysInStage ?? "?"}d`,
      });
    }
  }
  return bottlenecks.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      b.count - a.count ||
      a.territoryLabel.localeCompare(b.territoryLabel),
  );
}

export function dmForCandidate(row: ScoredCandidateWorkflowRow): string {
  return getDmForState(row.state) ?? "Unassigned";
}

export function stageAtOrBeyond(
  stage: CanonicalPipelineStage,
  target: CanonicalPipelineStage,
): boolean {
  return CANONICAL_PIPELINE_STAGES.indexOf(stage) >= CANONICAL_PIPELINE_STAGES.indexOf(target);
}
