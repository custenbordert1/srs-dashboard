import type { AutopilotOpportunityScore } from "@/lib/recruiting-autopilot/types";

export type OpportunityScoreInput = {
  currentRisk: number;
  impactScore: number;
  confidenceScore: number;
  openCalls: number;
  pipelineDepth: number;
  coveragePercent: number;
  hiringVelocityRisk?: number;
  deadlinePressure?: number;
};

export function computeAutopilotOpportunityScore(
  input: OpportunityScoreInput,
): AutopilotOpportunityScore {
  const potentialImprovement = Math.min(
    100,
    Math.round(
      (100 - input.currentRisk) * (input.impactScore / 100) * 0.55 +
        input.impactScore * 0.45,
    ),
  );
  const pipelineGap = Math.max(0, 12 - input.pipelineDepth);
  const estimatedCandidateGain = Math.min(
    50,
    Math.round(input.openCalls * 1.8 + pipelineGap * 1.4),
  );
  const estimatedCoverageGain = Math.min(
    40,
    Math.round(Math.max(0, 75 - input.coveragePercent) * (input.impactScore / 100)),
  );
  const estimatedCompletionGain = Math.min(
    35,
    Math.round(potentialImprovement * 0.4 + (input.deadlinePressure ?? 0) * 0.08),
  );
  const expectedRoiScore = Math.min(
    100,
    Math.round(
      potentialImprovement * 0.3 +
        estimatedCandidateGain * 1.4 +
        estimatedCoverageGain * 1.6 +
        estimatedCompletionGain * 1.3 +
        input.confidenceScore * 0.15,
    ),
  );

  return {
    currentRisk: input.currentRisk,
    potentialImprovement,
    estimatedCandidateGain,
    estimatedCoverageGain,
    estimatedCompletionGain,
    expectedRoiScore,
  };
}

export function aggregateExpectedOutcomes(
  recommendations: Array<Pick<AutopilotOpportunityScore, "estimatedCandidateGain" | "estimatedCoverageGain" | "potentialImprovement" | "currentRisk">>,
): {
  expectedAdditionalCandidates: number;
  expectedAdditionalHires: number;
  expectedAdditionalStoreCoverage: number;
  expectedRiskReduction: number;
} {
  let candidates = 0;
  let coverage = 0;
  let riskReduction = 0;
  for (const row of recommendations) {
    candidates += row.estimatedCandidateGain;
    coverage += row.estimatedCoverageGain;
    riskReduction += Math.round(row.potentialImprovement * 0.25);
  }
  return {
    expectedAdditionalCandidates: candidates,
    expectedAdditionalHires: Math.round(candidates * 0.22),
    expectedAdditionalStoreCoverage: coverage,
    expectedRiskReduction: Math.min(100, riskReduction),
  };
}
