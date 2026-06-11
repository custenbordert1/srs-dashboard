import type { DistrictManager } from "@/lib/dm-territory-map";
import {
  buildAttentionScore,
  buildDmTerritoryRollups,
  type TerritoryIntelligenceContext,
} from "@/lib/territory-intelligence/build-territory-rollup";
import { resolveCoverageHealthTier } from "@/lib/territory-intelligence/coverage-tier";
import {
  filterCandidatesByStates,
  filterJobsByStates,
} from "@/lib/territory-intelligence/metric-calculators";
import {
  aggregateStateHeatCells,
  computeApplicantVelocityTrend,
  computeCoverageRiskScoreForDm,
  computeRecruiterWorkloadScore,
  countHiresLast7Days,
  countLowApplicantFlowJobs,
  countZeroApplicantJobs,
  maxJobAgeDaysWithoutApplicants,
} from "@/lib/territory-intelligence/territory-intelligence-metrics";
import type {
  TerritoryHeatMapCell,
  TerritoryIntelligenceCenterMetrics,
  TerritoryIntelligenceCenterSnapshot,
  TerritoryIntelligenceExecutiveRollup,
  TerritoryIntelligenceTerritoryRow,
  TerritoryRecommendation,
} from "@/lib/territory-intelligence/types";
import { normalizeStateCode } from "@/lib/dm-territory-map";

const EXECUTIVE_ROLLUP_LIMIT = 10;

function buildHeatMapForTerritory(
  dmName: DistrictManager,
  states: string[],
  ctx: TerritoryIntelligenceContext,
  coveragePercent: number,
): TerritoryHeatMapCell[] {
  const dmJobs = filterJobsByStates(ctx.jobs, states);
  const dmCandidates = filterCandidatesByStates(ctx.candidates, states);
  const coverageByState = new Map(states.map((state) => [normalizeStateCode(state), coveragePercent]));

  return aggregateStateHeatCells({
    jobs: dmJobs,
    candidates: dmCandidates,
    states,
    coveragePercentByState: coverageByState,
  }).map((row) => ({
    id: `${dmName}:${row.state}`,
    label: row.state,
    state: row.state,
    tier: resolveCoverageHealthTier(row.score),
    score: row.score,
    openJobs: row.openJobs,
    zeroApplicantJobs: row.zeroApplicantJobs,
  }));
}

function buildRecommendations(
  dmName: DistrictManager,
  states: string[],
  metrics: TerritoryIntelligenceCenterMetrics,
  ctx: TerritoryIntelligenceContext,
): TerritoryRecommendation[] {
  const recommendations: TerritoryRecommendation[] = [];
  const dmJobs = filterJobsByStates(ctx.jobs, states);
  const dmCandidates = filterCandidatesByStates(ctx.candidates, states);

  const staleZero = maxJobAgeDaysWithoutApplicants(dmJobs, dmCandidates, ctx.fetchedAt);
  if (staleZero && staleZero.days >= 5) {
    recommendations.push({
      id: `${dmName}:zero-applicants:${staleZero.city}`,
      severity: staleZero.days >= 10 ? "critical" : "high",
      message: `No applicants in ${staleZero.city} for ${staleZero.days} days`,
      dmName,
      state: staleZero.state,
      city: staleZero.city,
    });
  }

  if (metrics.zeroApplicantJobs > 0) {
    const topJob = dmJobs.find((job) => {
      const scoped = dmCandidates.filter(
        (c) => c.positionId === job.jobId || c.positionName === job.name,
      );
      return scoped.length === 0;
    });
    if (topJob) {
      recommendations.push({
        id: `${dmName}:post-ads:${topJob.city}`,
        severity: "high",
        message: `Post additional ads in ${topJob.city}`,
        dmName,
        state: topJob.state,
        city: topJob.city,
      });
    }
  }

  if (metrics.coverageRiskScore >= 60) {
    const hotState = states[0] ?? "territory";
    recommendations.push({
      id: `${dmName}:coverage-risk`,
      severity: metrics.coverageRiskScore >= 80 ? "critical" : "high",
      message: `Coverage risk increasing in ${hotState} (${metrics.coverageRiskScore}/100)`,
      dmName,
      state: hotState,
    });
  }

  if (metrics.recruiterWorkloadScore >= 75) {
    recommendations.push({
      id: `${dmName}:recruiter-workload`,
      severity: "medium",
      message: "Recruiter workload exceeds threshold",
      dmName,
    });
  }

  if (metrics.applicantVelocity.direction === "down" && metrics.applicantVelocity.delta <= -3) {
    recommendations.push({
      id: `${dmName}:velocity-down`,
      severity: "medium",
      message: `Applicant velocity declining (${metrics.applicantVelocity.delta} vs prior week)`,
      dmName,
    });
  }

  return recommendations.slice(0, 8);
}

function buildCenterMetrics(
  dmName: DistrictManager,
  states: string[],
  ctx: TerritoryIntelligenceContext,
  baseRollup: ReturnType<typeof buildDmTerritoryRollups>[number],
): TerritoryIntelligenceCenterMetrics {
  const dmJobs = filterJobsByStates(ctx.jobs, states);
  const dmCandidates = filterCandidatesByStates(ctx.candidates, states);

  return {
    openCalls: baseRollup.metrics.openCalls,
    activeReps: baseRollup.metrics.activeReps,
    coveragePercent: baseRollup.metrics.coveragePercent,
    coverageTier: baseRollup.metrics.coverageTier,
    zeroApplicantJobs: countZeroApplicantJobs(dmJobs, dmCandidates),
    lowApplicantFlowJobs: countLowApplicantFlowJobs(dmJobs, dmCandidates),
    coverageRiskScore: computeCoverageRiskScoreForDm(dmName, ctx.coverage),
    recruiterWorkloadScore: computeRecruiterWorkloadScore(dmCandidates, ctx.workflows),
    hiresLast7Days: countHiresLast7Days(dmCandidates, ctx.fetchedAt),
    applicantVelocity: computeApplicantVelocityTrend(dmCandidates, ctx.fetchedAt),
  };
}

export function buildTerritoryIntelligenceCenter(
  ctx: TerritoryIntelligenceContext,
): TerritoryIntelligenceCenterSnapshot {
  const rollups = buildDmTerritoryRollups(ctx);

  const territories: TerritoryIntelligenceTerritoryRow[] = rollups.map((rollup) => {
    const metrics = buildCenterMetrics(rollup.dmName, rollup.states, ctx, rollup);
    const attentionScore =
      buildAttentionScore(rollup.metrics) +
      metrics.coverageRiskScore * 0.4 +
      metrics.zeroApplicantJobs * 3;

    return {
      dmName: rollup.dmName,
      states: rollup.states,
      metrics,
      attentionScore: Math.round(attentionScore),
      recommendations: buildRecommendations(rollup.dmName, rollup.states, metrics, ctx),
      heatMap: buildHeatMapForTerritory(
        rollup.dmName,
        rollup.states,
        ctx,
        metrics.coveragePercent,
      ),
    };
  });

  const executiveRollup = buildTerritoryIntelligenceExecutiveRollup(territories);
  const orgHeatMap = territories.flatMap((row) => row.heatMap);

  return {
    fetchedAt: ctx.fetchedAt,
    territories,
    executiveRollup,
    orgHeatMap,
  };
}

export function buildTerritoryIntelligenceExecutiveRollup(
  territories: TerritoryIntelligenceTerritoryRow[],
  limit = EXECUTIVE_ROLLUP_LIMIT,
): TerritoryIntelligenceExecutiveRollup {
  const highestRiskTerritories = [...territories]
    .sort(
      (a, b) =>
        b.attentionScore - a.attentionScore ||
        b.metrics.coverageRiskScore - a.metrics.coverageRiskScore ||
        a.dmName.localeCompare(b.dmName),
    )
    .slice(0, limit);

  const healthiestTerritories = [...territories]
    .sort(
      (a, b) =>
        b.metrics.coveragePercent - a.metrics.coveragePercent ||
        a.metrics.coverageRiskScore - b.metrics.coverageRiskScore ||
        a.dmName.localeCompare(b.dmName),
    )
    .slice(0, limit);

  return { highestRiskTerritories, healthiestTerritories };
}
