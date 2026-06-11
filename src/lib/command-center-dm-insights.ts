import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { DistrictManager } from "@/lib/dm-territory-map";
import {
  buildDmTerritoryRollups,
  buildRecruitingPipelineMetrics,
  TERRITORY_COVERAGE_THRESHOLD,
  topTerritoriesNeedingAttention,
  type RecruitingPipelineMetrics,
  type TerritoryIntelligenceContext,
  type TerritoryMetrics,
} from "@/lib/territory-intelligence";
import type { CommandCenterSnapshot } from "@/lib/recruiting-command-center";

/** @deprecated Use `TERRITORY_COVERAGE_THRESHOLD` from `@/lib/territory-intelligence`. */
export const COMMAND_CENTER_DM_COVERAGE_THRESHOLD = TERRITORY_COVERAGE_THRESHOLD;

export type CommandCenterTerritoryInsight = {
  dmName: DistrictManager;
  states: string[];
  openJobs: number;
  openCalls: number;
  activeReps: number;
  coveragePercent: number;
  coverageTier: TerritoryMetrics["coverageTier"];
  attentionScore: number;
};

export type CommandCenterRecruitingHealthSummary = RecruitingPipelineMetrics;

export type CommandCenterTerritoryRiskAlert = {
  id: string;
  severity: "critical" | "high" | "medium";
  title: string;
  detail: string;
  dmName?: string;
  state?: string;
};

export type CommandCenterDmInsightsSnapshot = {
  fetchedAt: string;
  territories: CommandCenterTerritoryInsight[];
  topTerritoriesNeedingAttention: CommandCenterTerritoryInsight[];
  recruitingHealth: CommandCenterRecruitingHealthSummary;
  riskAlerts: {
    criticalShortages: CommandCenterTerritoryRiskAlert[];
    unstaffedHighPriority: CommandCenterTerritoryRiskAlert[];
    belowThreshold: CommandCenterTerritoryRiskAlert[];
  };
  hasCoverageData: boolean;
};

function rollupToTerritoryInsight(
  rollup: ReturnType<typeof buildDmTerritoryRollups>[number],
): CommandCenterTerritoryInsight {
  const { metrics } = rollup;
  return {
    dmName: rollup.dmName,
    states: rollup.states,
    openJobs: metrics.openJobs,
    openCalls: metrics.openCalls,
    activeReps: metrics.activeReps,
    coveragePercent: metrics.coveragePercent,
    coverageTier: metrics.coverageTier,
    attentionScore: rollup.attentionScore,
  };
}

export function buildCommandCenterRecruitingHealth(input: {
  commandCenter: Pick<CommandCenterSnapshot, "applicantsLast7Days" | "funnel" | "fetchedAt">;
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
}): CommandCenterRecruitingHealthSummary {
  const ctx: TerritoryIntelligenceContext = {
    jobs: [],
    candidates: input.candidates,
    fetchedAt: input.commandCenter.fetchedAt,
    coverage: null,
    workflows: input.workflows,
  };

  const hiredFromFunnel = input.commandCenter.funnel.find((row) => row.label === "Hired")?.value;

  return buildRecruitingPipelineMetrics(ctx, {
    applicantsLast7Days: input.commandCenter.applicantsLast7Days,
    hired: hiredFromFunnel,
  });
}

export function buildCommandCenterDmInsights(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  fetchedAt: string;
  coverage: CoverageRiskSnapshot | null;
  workflows: CandidateWorkflowState | null;
  commandCenter: Pick<CommandCenterSnapshot, "applicantsLast7Days" | "funnel" | "fetchedAt">;
}): CommandCenterDmInsightsSnapshot {
  const ctx: TerritoryIntelligenceContext = {
    jobs: input.jobs,
    candidates: input.candidates,
    fetchedAt: input.fetchedAt,
    coverage: input.coverage,
    workflows: input.workflows,
  };

  const rollups = buildDmTerritoryRollups(ctx);
  const territories = rollups.map(rollupToTerritoryInsight);
  const top = topTerritoriesNeedingAttention(rollups, 10).map(rollupToTerritoryInsight);

  const recruitingHealth = buildCommandCenterRecruitingHealth({
    commandCenter: input.commandCenter,
    candidates: input.candidates,
    workflows: input.workflows,
  });

  const criticalShortages: CommandCenterTerritoryRiskAlert[] = [];
  const unstaffedHighPriority: CommandCenterTerritoryRiskAlert[] = [];
  const belowThreshold: CommandCenterTerritoryRiskAlert[] = [];

  if (input.coverage) {
    for (const row of input.coverage.dmAlerts.highRiskProjects.slice(0, 6)) {
      criticalShortages.push({
        id: `risk-${row.opportunityId}`,
        severity: "critical",
        title: row.projectName,
        detail: `${row.client} · ${row.storeName}, ${row.state} · coverage ${row.coverageScore}`,
        dmName: row.territoryOwner,
        state: row.state,
      });
    }

    for (const row of input.coverage.opportunities
      .filter((o) => o.staffingRisk === "RED" && o.priority.toLowerCase() === "high")
      .slice(0, 6)) {
      unstaffedHighPriority.push({
        id: `unstaffed-${row.opportunityId}`,
        severity: "critical",
        title: row.projectName,
        detail: `${row.storeName}, ${row.state} · no staffing coverage`,
        dmName: row.territoryOwner,
        state: row.state,
      });
    }

    for (const row of input.coverage.executiveSummary.highOpportunityLowRepMarkets.slice(0, 6)) {
      belowThreshold.push({
        id: `gap-${row.state}-${row.territoryOwner}`,
        severity: "high",
        title: `${row.state} staffing gap`,
        detail: `${row.openOpportunities} open calls · ${row.activeReps} active reps`,
        dmName: row.territoryOwner,
        state: row.state,
      });
    }
  }

  for (const territory of territories) {
    if (territory.coveragePercent >= TERRITORY_COVERAGE_THRESHOLD) continue;
    belowThreshold.push({
      id: `health-${territory.dmName}`,
      severity: territory.coveragePercent < 50 ? "critical" : "high",
      title: `${territory.dmName} below coverage threshold`,
      detail: `${territory.coveragePercent}% territory health · ${territory.openJobs} open jobs`,
      dmName: territory.dmName,
    });
  }

  return {
    fetchedAt: input.fetchedAt,
    territories,
    topTerritoriesNeedingAttention: top,
    recruitingHealth,
    riskAlerts: {
      criticalShortages,
      unstaffedHighPriority,
      belowThreshold: belowThreshold.slice(0, 8),
    },
    hasCoverageData: input.coverage !== null,
  };
}
