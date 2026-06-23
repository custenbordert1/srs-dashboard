import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { ApplicantPerformanceRow } from "@/lib/autonomous-recruiting-execution/types";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/types";
import {
  saveRecommendationFeedbackIndex,
} from "@/lib/autonomous-recruiting-autopilot/recommendation-feedback-store";
import type { RecommendationFeedbackIndex } from "@/lib/autonomous-recruiting-autopilot/types";
import type {
  RecommendationEffectivenessRow,
  RecommendationFeedbackSnapshot,
} from "@/lib/autonomous-recruiting-autopilot/types";

function effectivenessScore(generated: number, executed: number, successful: number): number {
  if (generated === 0) return 50;
  const executionRate = executed / generated;
  const successRate = executed > 0 ? successful / executed : 0;
  return Math.round((executionRate * 0.4 + successRate * 0.6) * 100);
}

function buildRowKey(territory: string, type: string, postingAction?: string): string {
  return `${territory}:${type}:${postingAction ?? "any"}`;
}

export function buildRecommendationFeedback(input: {
  correlations: ExecutionCorrelation[];
  applicantPerformance: ApplicantPerformanceRow[];
  pipelineSnapshot?: PipelineIntelligenceSnapshot;
  fetchedAt: string;
}): RecommendationFeedbackSnapshot {
  const buckets = new Map<string, RecommendationEffectivenessRow>();

  for (const correlation of input.correlations) {
    const key = buildRowKey(correlation.territory, correlation.type, correlation.adType);
    const existing = buckets.get(key) ?? {
      key,
      territory: correlation.territory,
      recommendationType: correlation.type,
      postingAction: correlation.adType,
      generated: 0,
      executed: 0,
      successful: 0,
      effectivenessScore: 50,
      avgApplicantsAfter: 0,
      avgReadyForMel: 0,
    };

    existing.generated += 1;
    if (["executing", "completed"].includes(correlation.status)) existing.executed += 1;
    if (correlation.status === "completed") existing.successful += 1;
    buckets.set(key, existing);
  }

  const applicantByTerritory = new Map(
    input.applicantPerformance.map((row) => [row.territoryLabel, row]),
  );

  for (const row of buckets.values()) {
    const perf = applicantByTerritory.get(row.territory);
    row.avgApplicantsAfter = perf?.applicants ?? 0;
    row.avgReadyForMel = perf?.readyForMel ?? 0;
    row.effectivenessScore = effectivenessScore(row.generated, row.executed, row.successful);
  }

  const rows = [...buckets.values()].sort(
    (a, b) => b.effectivenessScore - a.effectivenessScore,
  );

  const territoryWeights: Record<string, number> = {};
  const typeWeights: Record<string, number> = {};

  for (const row of rows) {
    const priorTerritory = territoryWeights[row.territory] ?? 0;
    const priorType = typeWeights[row.recommendationType] ?? 0;
    territoryWeights[row.territory] = Math.round((priorTerritory + row.effectivenessScore) / (priorTerritory ? 2 : 1));
    typeWeights[row.recommendationType] = Math.round((priorType + row.effectivenessScore) / (priorType ? 2 : 1));
  }

  if (input.pipelineSnapshot) {
    for (const territory of input.pipelineSnapshot.territories) {
      const melStage = territory.stages.find((stage) => stage.stage === "Ready for MEL");
      if (!melStage) continue;
      const boost = melStage.conversionToNextPct ?? 50;
      territoryWeights[territory.territoryLabel] = Math.round(
        ((territoryWeights[territory.territoryLabel] ?? 50) + boost) / 2,
      );
    }
  }

  const topPerforming = rows.filter((row) => row.generated > 0).slice(0, 5);
  const lowestPerforming = [...rows]
    .filter((row) => row.generated > 0)
    .sort((a, b) => a.effectivenessScore - b.effectivenessScore)
    .slice(0, 5);

  return {
    fetchedAt: input.fetchedAt,
    rows,
    topPerforming,
    lowestPerforming,
    territoryWeights,
    typeWeights,
  };
}

export async function buildAndPersistRecommendationFeedback(input: {
  correlations: ExecutionCorrelation[];
  applicantPerformance: ApplicantPerformanceRow[];
  pipelineSnapshot?: PipelineIntelligenceSnapshot;
  fetchedAt: string;
}): Promise<RecommendationFeedbackSnapshot> {
  const snapshot = buildRecommendationFeedback(input);
  const index: RecommendationFeedbackIndex = {
    territoryWeights: snapshot.territoryWeights,
    typeWeights: snapshot.typeWeights,
  };
  await saveRecommendationFeedbackIndex(index);
  return snapshot;
}
