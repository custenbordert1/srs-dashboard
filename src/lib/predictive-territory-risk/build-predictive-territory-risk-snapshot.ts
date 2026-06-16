import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import { buildProjectForecastRows } from "@/lib/executive-operations-center/build-project-forecast";
import { buildPlacementCommandCenterSnapshot } from "@/lib/placement-command-center/build-placement-command-center-snapshot";
import {
  buildDmCoverageMissForecasts,
  buildTerritoryMissCompletionForecasts,
  buildZeroPipelineStoreForecasts,
  countAlertsByDm,
  countFollowUpsByDm,
} from "@/lib/predictive-territory-risk/build-forecasts";
import { buildPredictiveRecommendations } from "@/lib/predictive-territory-risk/build-recommendations";
import {
  computeRiskFactors,
  computeWeightedRiskScore,
  detectRiskTrend,
} from "@/lib/predictive-territory-risk/compute-risk-score";
import { riskLevelFromScore } from "@/lib/predictive-territory-risk/risk-levels";
import type {
  PredictiveTerritoryRiskExecutiveSummary,
  PredictiveTerritoryRiskRow,
  PredictiveTerritoryRiskSnapshot,
} from "@/lib/predictive-territory-risk/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildTerritoryIntelligenceCenter } from "@/lib/territory-intelligence";
import { normalizeStateCode } from "@/lib/dm-territory-map";

const TERRITORY_RANK_LIMIT = 25;

export type BuildPredictiveTerritoryRiskInput = {
  bundle: RecruitingIntelligenceRouteBundle;
  alerts?: ExecutiveAlert[];
  followUps?: ExecutiveAlertFollowUp[];
  referenceMs?: number;
};

function buildDmTerritoryRow(input: {
  dmName: string;
  states: string[];
  openCalls: number;
  coveragePercent: number;
  pipelineDepth: number;
  applicantVelocityCurrent7d: number;
  applicantVelocityPrior7d: number;
  hiresLast7Days: number;
  atRiskProjectRatio: number;
  highPriorityOpenRatio: number;
  alertCount: number;
  followUpCount: number;
  overdueFollowUpCount: number;
  zeroApplicantJobs: number;
  recruiterWorkloadScore: number;
}): PredictiveTerritoryRiskRow {
  const factors = computeRiskFactors({
    openCalls: input.openCalls,
    pipelineDepth: input.pipelineDepth,
    applicantVelocityCurrent7d: input.applicantVelocityCurrent7d,
    applicantVelocityPrior7d: input.applicantVelocityPrior7d,
    hiresLast7Days: input.hiresLast7Days,
    coveragePercent: input.coveragePercent,
    atRiskProjectRatio: input.atRiskProjectRatio,
    highPriorityOpenRatio: input.highPriorityOpenRatio,
    alertCount: input.alertCount,
    followUpCount: input.followUpCount,
    overdueFollowUpCount: input.overdueFollowUpCount,
  });
  const riskScore = computeWeightedRiskScore(factors);
  const velocityDelta = input.applicantVelocityCurrent7d - input.applicantVelocityPrior7d;

  return {
    entityId: `dm:${input.dmName}`,
    entityType: "dm",
    label: input.dmName,
    dmName: input.dmName,
    states: input.states,
    riskScore,
    riskLevel: riskLevelFromScore(riskScore),
    trend: detectRiskTrend({
      applicantVelocityDelta: velocityDelta,
      coveragePercent: input.coveragePercent,
      riskScore,
    }),
    factors,
    openCalls: input.openCalls,
    coveragePercent: input.coveragePercent,
    pipelineDepth: input.pipelineDepth,
    alertCount: input.alertCount,
    followUpCount: input.followUpCount,
    recommendations: buildPredictiveRecommendations({
      factors,
      dmName: input.dmName,
      zeroApplicantJobs: input.zeroApplicantJobs,
      recruiterWorkloadScore: input.recruiterWorkloadScore,
    }),
    navigation: {
      tabId: "executive-alerts",
      elementId: "executive-alert-center",
      label: "Open Executive Alerts",
    },
  };
}

export function buildPredictiveTerritoryRiskSnapshot(
  input: BuildPredictiveTerritoryRiskInput,
): PredictiveTerritoryRiskSnapshot {
  const { bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const alerts = input.alerts ?? [];
  const followUps = input.followUps ?? [];

  const territoryCenter = buildTerritoryIntelligenceCenter({
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    workflows: bundle.workflows,
  });

  const placement = buildPlacementCommandCenterSnapshot({
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    opportunities: bundle.opportunities,
    activeReps: bundle.activeReps,
  });

  const projectForecasts = buildProjectForecastRows(bundle.coverage);
  const dmByOpportunity = new Map(
    bundle.coverage.opportunities.map((row) => [row.opportunityId, row.territoryOwner]),
  );

  const alertsByDm = countAlertsByDm(alerts);
  const followUpCounts = countFollowUpsByDm(followUps, alerts, referenceMs);

  const dmProjectStats = new Map<
    string,
    { total: number; atRisk: number; highPriority: number; pipeline: number }
  >();

  for (const row of bundle.coverage.opportunities) {
    const dm = row.territoryOwner || "Unassigned";
    const stats = dmProjectStats.get(dm) ?? { total: 0, atRisk: 0, highPriority: 0, pipeline: 0 };
    stats.total += 1;
    if (row.staffingRisk !== "GREEN" || row.coverageScore < 60) stats.atRisk += 1;
    if (row.priority.toLowerCase() === "high") stats.highPriority += 1;
    stats.pipeline += row.pipelineScore;
    dmProjectStats.set(dm, stats);
  }

  const pipelineByDm = new Map<string, number>();
  for (const row of placement.storeCoverage) {
    const coverageRow = bundle.coverage.opportunities.find(
      (entry) => entry.opportunityId === row.opportunityId,
    );
    const dm = coverageRow?.territoryOwner ?? "Unassigned";
    pipelineByDm.set(dm, (pipelineByDm.get(dm) ?? 0) + row.candidatesInPipeline);
  }

  const territories = territoryCenter.territories.map((row) => {
    const stats = dmProjectStats.get(row.dmName) ?? {
      total: 0,
      atRisk: 0,
      highPriority: 0,
      pipeline: 0,
    };
    const atRiskProjectRatio = stats.total > 0 ? stats.atRisk / stats.total : 0;
    const highPriorityOpenRatio = stats.total > 0 ? stats.highPriority / stats.total : 0;

    return buildDmTerritoryRow({
      dmName: row.dmName,
      states: row.states,
      openCalls: row.metrics.openCalls,
      coveragePercent: row.metrics.coveragePercent,
      pipelineDepth: pipelineByDm.get(row.dmName) ?? 0,
      applicantVelocityCurrent7d: row.metrics.applicantVelocity.current7d,
      applicantVelocityPrior7d: row.metrics.applicantVelocity.prior7d,
      hiresLast7Days: row.metrics.hiresLast7Days,
      atRiskProjectRatio,
      highPriorityOpenRatio,
      alertCount: alertsByDm.get(row.dmName) ?? 0,
      followUpCount: followUpCounts.total.get(row.dmName) ?? 0,
      overdueFollowUpCount: followUpCounts.overdue.get(row.dmName) ?? 0,
      zeroApplicantJobs: row.metrics.zeroApplicantJobs,
      recruiterWorkloadScore: row.metrics.recruiterWorkloadScore,
    });
  });

  const projects: PredictiveTerritoryRiskRow[] = bundle.coverage.opportunities
    .map((row) => {
      const store = placement.storeCoverage.find((entry) => entry.opportunityId === row.opportunityId);
      const forecast = projectForecasts.find((entry) => entry.opportunityId === row.opportunityId);
      const atRiskProjectRatio =
        forecast?.outcome === "likely-to-miss" ? 1 : forecast?.outcome === "at-risk" ? 0.7 : 0.2;

      const dmRow = territories.find((entry) => entry.dmName === row.territoryOwner);
      const factors = computeRiskFactors({
        openCalls: store?.openCalls ?? 1,
        pipelineDepth: store?.candidatesInPipeline ?? 0,
        applicantVelocityCurrent7d: dmRow?.factors.applicationVelocityRisk
          ? 100 - dmRow.factors.applicationVelocityRisk
          : 0,
        applicantVelocityPrior7d: 0,
        hiresLast7Days: dmRow?.factors.hiringVelocityRisk
          ? Math.round((100 - dmRow.factors.hiringVelocityRisk) / 12)
          : 0,
        coveragePercent: row.coverageScore,
        atRiskProjectRatio,
        highPriorityOpenRatio: row.priority.toLowerCase() === "high" ? 1 : 0.3,
        alertCount: alerts.filter((alert) => alert.context?.opportunityId === row.opportunityId).length,
        followUpCount: 0,
        overdueFollowUpCount: 0,
      });
      const riskScore = computeWeightedRiskScore(factors);

      return {
        entityId: `project:${row.opportunityId}`,
        entityType: "project" as const,
        label: row.projectName,
        dmName: row.territoryOwner,
        states: [normalizeStateCode(row.state)],
        riskScore,
        riskLevel: riskLevelFromScore(riskScore),
        trend: dmRow?.trend ?? "stable",
        factors,
        openCalls: store?.openCalls ?? 1,
        coveragePercent: row.coverageScore,
        pipelineDepth: store?.candidatesInPipeline ?? 0,
        alertCount: alerts.filter((alert) => alert.context?.opportunityId === row.opportunityId).length,
        followUpCount: 0,
        recommendations: buildPredictiveRecommendations({
          factors,
          dmName: row.territoryOwner,
          zeroApplicantJobs: store?.candidatesInPipeline === 0 ? 1 : 0,
          recruiterWorkloadScore: dmRow?.factors.followUpBacklogRisk ?? 0,
        }),
        navigation: {
          tabId: "placement-command-center" as const,
          elementId: "placement-project-forecasts",
          label: "Open Placement Forecasts",
        },
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 40);

  const clusterMap = new Map<string, PredictiveTerritoryRiskRow>();
  for (const store of placement.storeCoverage) {
    const coverageRow = bundle.coverage.opportunities.find(
      (entry) => entry.opportunityId === store.opportunityId,
    );
    const dmName = coverageRow?.territoryOwner ?? "Unassigned";
    const state = normalizeStateCode(coverageRow?.state ?? "");
    const clusterKey = `${dmName}:${state}`;
    const existing = clusterMap.get(clusterKey);
    const clusterRisk = computeWeightedRiskScore(
      computeRiskFactors({
        openCalls: store.openCalls,
        pipelineDepth: store.candidatesInPipeline,
        applicantVelocityCurrent7d: 0,
        applicantVelocityPrior7d: 0,
        hiresLast7Days: 0,
        coveragePercent: store.coveragePercent,
        atRiskProjectRatio: store.risk === "red" ? 1 : store.risk === "yellow" ? 0.6 : 0.2,
        highPriorityOpenRatio: coverageRow?.priority.toLowerCase() === "high" ? 1 : 0.2,
        alertCount: 0,
        followUpCount: 0,
        overdueFollowUpCount: 0,
      }),
    );

    if (!existing || clusterRisk > existing.riskScore) {
      const dmTerritory = territories.find((row) => row.dmName === dmName);
      clusterMap.set(clusterKey, {
        entityId: `cluster:${clusterKey}`,
        entityType: "store-cluster",
        label: `${state} cluster · ${dmName}`,
        dmName,
        states: [state],
        riskScore: clusterRisk,
        riskLevel: riskLevelFromScore(clusterRisk),
        trend: dmTerritory?.trend ?? "stable",
        factors: computeRiskFactors({
          openCalls: store.openCalls,
          pipelineDepth: store.candidatesInPipeline,
          applicantVelocityCurrent7d: 0,
          applicantVelocityPrior7d: 0,
          hiresLast7Days: 0,
          coveragePercent: store.coveragePercent,
          atRiskProjectRatio: store.risk === "red" ? 1 : 0.4,
          highPriorityOpenRatio: 0.3,
          alertCount: 0,
          followUpCount: 0,
          overdueFollowUpCount: 0,
        }),
        openCalls: store.openCalls,
        coveragePercent: store.coveragePercent,
        pipelineDepth: store.candidatesInPipeline,
        alertCount: 0,
        followUpCount: 0,
        recommendations: buildPredictiveRecommendations({
          factors: computeRiskFactors({
            openCalls: store.openCalls,
            pipelineDepth: store.candidatesInPipeline,
            applicantVelocityCurrent7d: 0,
            applicantVelocityPrior7d: 0,
            hiresLast7Days: 0,
            coveragePercent: store.coveragePercent,
            atRiskProjectRatio: store.risk === "red" ? 1 : 0.4,
            highPriorityOpenRatio: 0.3,
            alertCount: 0,
            followUpCount: 0,
            overdueFollowUpCount: 0,
          }),
          dmName,
          zeroApplicantJobs: store.candidatesInPipeline === 0 ? 1 : 0,
          recruiterWorkloadScore: 0,
        }),
        navigation: {
          tabId: "placement-command-center",
          elementId: "placement-store-coverage",
          label: "Open Store Coverage",
        },
      });
    } else if (existing) {
      existing.openCalls += store.openCalls;
      existing.pipelineDepth += store.candidatesInPipeline;
    }
  }

  const storeClusters = [...clusterMap.values()].sort((a, b) => b.riskScore - a.riskScore);

  const rankedTerritories = [...territories].sort((a, b) => b.riskScore - a.riskScore);
  const highestRiskTerritories = rankedTerritories.slice(0, TERRITORY_RANK_LIMIT);
  const healthiestTerritories = [...rankedTerritories]
    .sort((a, b) => a.riskScore - b.riskScore)
    .slice(0, TERRITORY_RANK_LIMIT);

  const forecasts = [
    ...buildZeroPipelineStoreForecasts(placement.storeCoverage),
    ...buildTerritoryMissCompletionForecasts(projectForecasts, dmByOpportunity),
    ...buildDmCoverageMissForecasts(rankedTerritories),
  ].slice(0, 30);

  const executiveSummary: PredictiveTerritoryRiskExecutiveSummary = {
    totalCriticalTerritories: territories.filter((row) => row.riskLevel === "critical").length,
    totalHighRiskTerritories: territories.filter((row) => row.riskLevel === "high").length,
    projectsAtRisk: projects.filter((row) => row.riskLevel === "high" || row.riskLevel === "critical")
      .length,
    predictedCoverageGap: Math.round(
      territories.reduce((sum, row) => sum + Math.max(0, 75 - row.coveragePercent), 0) /
        Math.max(territories.length, 1),
    ),
  };

  return {
    generatedAt: bundle.fetchedAt,
    executiveSummary,
    highestRiskTerritories,
    healthiestTerritories,
    forecasts,
    territories: rankedTerritories,
    projects,
    storeClusters,
  };
}
