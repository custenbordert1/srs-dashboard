import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { RecommendationSimulationTest } from "@/lib/coverage-optimization-simulator/types";
import {
  buildBaselineMetrics,
  diffImpactMetrics,
  emptyImpactMetrics,
  simulateScenarioImpact,
  type ImpactModelContext,
} from "@/lib/coverage-optimization-simulator/impact-model";
import { autopilotKindToScenarioKind } from "@/lib/coverage-optimization-simulator/scenarios";
import { territoryScaleForRow } from "@/lib/coverage-optimization-simulator/territory-scope";
import type { PredictiveTerritoryRiskRow } from "@/lib/predictive-territory-risk/types";

function expectedFromRecommendation(rec: AutopilotRecommendation) {
  return {
    additionalCandidates: rec.opportunity.estimatedCandidateGain,
    additionalHires: Math.round(rec.opportunity.estimatedCandidateGain * 0.18),
    coveragePercent: rec.opportunity.estimatedCoverageGain,
    openCallsReduced: Math.round(rec.opportunity.estimatedCoverageGain * 0.15),
    riskReduction: Math.round(rec.opportunity.potentialImprovement * 0.6),
  };
}

function alignmentScore(
  expected: ReturnType<typeof expectedFromRecommendation>,
  simulated: ReturnType<typeof expectedFromRecommendation>,
): number {
  const candidateDelta = Math.abs(expected.additionalCandidates - simulated.additionalCandidates);
  const coverageDelta = Math.abs(expected.coveragePercent - simulated.coveragePercent);
  const hireDelta = Math.abs(expected.additionalHires - simulated.additionalHires);
  const penalty = candidateDelta * 0.4 + coverageDelta * 2 + hireDelta * 0.6;
  return Math.max(0, Math.round(100 - penalty));
}

export function buildRecommendationSimulationTests(input: {
  recommendations: AutopilotRecommendation[];
  ctx: ImpactModelContext;
  territoryRows: PredictiveTerritoryRiskRow[];
}): RecommendationSimulationTest[] {
  const baseline = buildBaselineMetrics(input.ctx);

  return input.recommendations.map((rec) => {
    const scenarioKind = autopilotKindToScenarioKind(rec.kind);
    const territoryRow = input.territoryRows.find((row) => row.entityId === rec.entityId);
    const expectedImpact = expectedFromRecommendation(rec);

    if (!scenarioKind) {
      return {
        recommendationId: rec.id,
        recommendationTitle: rec.title,
        recommendationKind: rec.kind,
        entityLabel: rec.entityLabel,
        expectedImpact,
        simulatedImpact: emptyImpactMetrics(),
        confidenceLow: rec.confidenceScore - 12,
        confidenceHigh: rec.confidenceScore + 12,
        alignmentScore: 0,
      };
    }

    const simulated = simulateScenarioImpact({
      kind: scenarioKind,
      ctx: input.ctx,
      confidenceScore: rec.confidenceScore,
      territoryScale: territoryScaleForRow(territoryRow),
    });

    const simulatedImpact = diffImpactMetrics(simulated.projected, baseline);
    const spread = Math.max(4, Math.round((100 - rec.confidenceScore) * 0.3));

    return {
      recommendationId: rec.id,
      recommendationTitle: rec.title,
      recommendationKind: rec.kind,
      entityLabel: rec.entityLabel,
      expectedImpact,
      simulatedImpact,
      confidenceLow: Math.max(20, rec.confidenceScore - spread),
      confidenceHigh: Math.min(99, rec.confidenceScore + spread),
      alignmentScore: alignmentScore(expectedImpact, simulatedImpact),
    };
  });
}
