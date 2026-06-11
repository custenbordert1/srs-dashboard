import type { CoverageOptimizationSnapshot } from "@/lib/coverage-optimization";
import type { OpportunityRiskPrediction } from "@/lib/ai-recruiting-command-center/types";

export function buildOpportunityRiskPredictions(
  coverageOptimization: CoverageOptimizationSnapshot | null,
): OpportunityRiskPrediction[] {
  if (!coverageOptimization) return [];

  const prioritizedById = new Map(
    coverageOptimization.prioritizedOpenCalls.map((row) => [row.opportunityId, row]),
  );

  return coverageOptimization.recommendations.slice(0, 20).map((rec) => {
    const prioritized = prioritizedById.get(rec.opportunityId);
    const fillProbability = rec.fillProbability;
    const coverageRisk = prioritized?.coverageRiskScore ?? 100 - rec.confidenceScore;
    const deadlineRisk = prioritized ? prioritized.deadlinePressure : 50;
    const staffingShortageRisk = prioritized
      ? 100 - prioritized.applicantAvailability
      : rec.bestRep
        ? 30
        : 90;
    const overallRiskScore = Math.round(
      (100 - fillProbability) * 0.35 +
        coverageRisk * 0.3 +
        deadlineRisk * 0.2 +
        staffingShortageRisk * 0.15,
    );

    const explanation = rec.bestRep
      ? `${rec.projectName}: ${rec.bestRep.repName} recommended with ${rec.confidenceScore}% confidence · fill probability ${fillProbability}%.`
      : `${rec.projectName}: no viable rep — high staffing risk with ${fillProbability}% fill probability.`;

    return {
      opportunityId: rec.opportunityId,
      projectName: rec.projectName,
      fillProbability,
      coverageRisk,
      deadlineRisk,
      staffingShortageRisk,
      overallRiskScore,
      explanation,
    };
  });
}

export function topOpportunityRisks(
  predictions: OpportunityRiskPrediction[],
  limit = 10,
): OpportunityRiskPrediction[] {
  return [...predictions].sort((a, b) => b.overallRiskScore - a.overallRiskScore).slice(0, limit);
}
