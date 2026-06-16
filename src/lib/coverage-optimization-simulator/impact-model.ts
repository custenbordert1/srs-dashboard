import type { SimulatorScenarioKind, CoverageImpactMetrics } from "@/lib/coverage-optimization-simulator/types";
import { scenarioDefinitionForKind } from "@/lib/coverage-optimization-simulator/scenarios";

export type ImpactModelContext = {
  openCalls: number;
  coveragePercent: number;
  predictedCoverageGap: number;
  criticalTerritories: number;
  recoverableCandidates: number;
  potentialPlacements: number;
  reEngagementCoverageGain: number;
  pipelineDepth: number;
  hiringVelocity: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value);
}

export function emptyImpactMetrics(): CoverageImpactMetrics {
  return {
    additionalCandidates: 0,
    additionalHires: 0,
    coveragePercent: 0,
    openCallsReduced: 0,
    riskReduction: 0,
  };
}

export function diffImpactMetrics(
  projected: CoverageImpactMetrics,
  current: CoverageImpactMetrics,
): CoverageImpactMetrics {
  return {
    additionalCandidates: projected.additionalCandidates - current.additionalCandidates,
    additionalHires: projected.additionalHires - current.additionalHires,
    coveragePercent: round(projected.coveragePercent - current.coveragePercent),
    openCallsReduced: projected.openCallsReduced - current.openCallsReduced,
    riskReduction: round(projected.riskReduction - current.riskReduction),
  };
}

function scenarioCandidateGain(kind: SimulatorScenarioKind, ctx: ImpactModelContext): number {
  const base = Math.max(1, ctx.openCalls + ctx.pipelineDepth);
  switch (kind) {
    case "increase-pay":
      return round(base * 0.14 + ctx.hiringVelocity * 0.6);
    case "expand-radius":
      return round(base * 0.18 + ctx.predictedCoverageGap * 0.25);
    case "add-recruiter":
      return round(base * 0.22 + ctx.openCalls * 0.08);
    case "add-budget":
      return round(base * 0.16 + ctx.pipelineDepth * 0.12);
    case "re-engage-candidates":
      return round(ctx.recoverableCandidates * 0.35 + ctx.potentialPlacements * 1.2);
    case "territory-blitz":
      return round(base * 0.28 + ctx.criticalTerritories * 4);
    case "refresh-job-postings":
      return round(base * 0.1 + ctx.pipelineDepth * 0.08);
    default:
      return round(base * 0.1);
  }
}

function scenarioCoverageGain(kind: SimulatorScenarioKind, ctx: ImpactModelContext): number {
  const gap = ctx.predictedCoverageGap;
  switch (kind) {
    case "increase-pay":
      return clamp(round(gap * 0.18 + 2), 1, 12);
    case "expand-radius":
      return clamp(round(gap * 0.28 + 4), 2, 18);
    case "add-recruiter":
      return clamp(round(gap * 0.22 + 3), 2, 15);
    case "add-budget":
      return clamp(round(gap * 0.2 + 2), 1, 14);
    case "re-engage-candidates":
      return clamp(round(ctx.reEngagementCoverageGain || gap * 0.15 + 3), 2, 25);
    case "territory-blitz":
      return clamp(round(gap * 0.35 + 5), 3, 22);
    case "refresh-job-postings":
      return clamp(round(gap * 0.12 + 1), 1, 8);
    default:
      return clamp(round(gap * 0.1), 1, 10);
  }
}

export function simulateScenarioImpact(input: {
  kind: SimulatorScenarioKind;
  ctx: ImpactModelContext;
  confidenceScore?: number;
  territoryScale?: number;
}): {
  projected: CoverageImpactMetrics;
  expectedRoiScore: number;
  confidenceScore: number;
  confidenceLow: number;
  confidenceHigh: number;
} {
  const definition = scenarioDefinitionForKind(input.kind);
  const scale = clamp(input.territoryScale ?? 1, 0.25, 1.5);
  const confidence = clamp(input.confidenceScore ?? 68, 35, 95);

  const additionalCandidates = round(scenarioCandidateGain(input.kind, input.ctx) * scale);
  const coveragePercent = round(scenarioCoverageGain(input.kind, input.ctx) * scale);
  const additionalHires = round(
    additionalCandidates * (input.kind === "re-engage-candidates" ? 0.22 : 0.16) +
      input.ctx.potentialPlacements * (input.kind === "re-engage-candidates" ? 0.15 : 0),
  );
  const openCallsReduced = clamp(
    round(additionalHires * 0.85 + coveragePercent * 0.12),
    0,
    input.ctx.openCalls,
  );
  const riskReduction = clamp(
    round(coveragePercent * 1.4 + openCallsReduced * 0.8 + input.ctx.criticalTerritories * 0.5),
    0,
    100,
  );

  const projected: CoverageImpactMetrics = {
    additionalCandidates,
    additionalHires,
    coveragePercent: clamp(input.ctx.coveragePercent + coveragePercent, 0, 100),
    openCallsReduced,
    riskReduction,
  };

  const expectedRoiScore = round(
    additionalCandidates * 3 +
      additionalHires * 9 +
      coveragePercent * 6 +
      openCallsReduced * 4 +
      riskReduction * 2,
  ) * definition.baseRoiMultiplier;

  const spread = Math.max(4, round((100 - confidence) * 0.35));
  return {
    projected,
    expectedRoiScore: round(expectedRoiScore),
    confidenceScore: confidence,
    confidenceLow: clamp(confidence - spread, 20, 95),
    confidenceHigh: clamp(confidence + spread, 25, 99),
  };
}

export function buildBaselineMetrics(ctx: ImpactModelContext): CoverageImpactMetrics {
  return {
    additionalCandidates: 0,
    additionalHires: 0,
    coveragePercent: ctx.coveragePercent,
    openCallsReduced: 0,
    riskReduction: 0,
  };
}
