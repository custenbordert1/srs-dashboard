import { countCandidatesLast7Days, type BreezyCandidate, type BreezyJob } from "@/lib/breezy-api";
import { isMelReadyStatus } from "@/lib/candidate-action-sla";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildTerritoryHealthScore } from "@/lib/dm-dashboard/territory-health-score";
import {
  DISTRICT_MANAGERS,
  getAssignedStatesForDm,
  normalizeStateCode,
  type DistrictManager,
} from "@/lib/dm-territory-map";
import {
  resolveCoverageHealthTier,
  type CoverageHealthTier,
} from "@/lib/dm-portal/dm-portal-operational";
import type { CommandCenterSnapshot } from "@/lib/recruiting-command-center";

export const COMMAND_CENTER_DM_COVERAGE_THRESHOLD = 50;

export type CommandCenterTerritoryInsight = {
  dmName: DistrictManager;
  states: string[];
  openJobs: number;
  openCalls: number;
  activeReps: number;
  coveragePercent: number;
  coverageTier: CoverageHealthTier;
  attentionScore: number;
};

export type CommandCenterRecruitingHealthSummary = {
  applicantsLast7Days: number;
  paperworkSent: number;
  readyForMel: number;
  hired: number;
};

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

function isHiredStage(stage: string): boolean {
  const normalized = stage.toLowerCase();
  return (
    normalized.includes("hired") ||
    normalized.includes("offer") ||
    normalized.includes("onboard") ||
    normalized.includes("active rep")
  );
}

function countHiredFromCandidates(candidates: BreezyCandidate[]): number {
  return candidates.filter((c) => isHiredStage(c.stage)).length;
}

function countWorkflowPaperworkSent(workflows: CandidateWorkflowState): number {
  let count = 0;
  for (const workflow of Object.values(workflows)) {
    if (workflow.paperworkStatus === "sent" || workflow.paperworkStatus === "viewed") {
      count += 1;
    }
  }
  return count;
}

function countWorkflowReadyForMel(workflows: CandidateWorkflowState): number {
  let count = 0;
  for (const workflow of Object.values(workflows)) {
    if (isMelReadyStatus(workflow.workflowStatus)) count += 1;
  }
  return count;
}

function aggregateCoverageByState(coverage: CoverageRiskSnapshot | null): Map<string, number> {
  const activeRepsByState = new Map<string, number>();
  if (!coverage) return activeRepsByState;
  for (const row of coverage.opportunities) {
    const state = normalizeStateCode(row.state);
    const nearby = row.nearby.activeWithin50;
    activeRepsByState.set(state, Math.max(activeRepsByState.get(state) ?? 0, nearby));
  }
  for (const row of coverage.executiveSummary.lowDensityStates) {
    const state = normalizeStateCode(row.state);
    activeRepsByState.set(state, Math.max(activeRepsByState.get(state) ?? 0, row.activeReps));
  }
  return activeRepsByState;
}

function openCallsForDm(dmName: string, coverage: CoverageRiskSnapshot | null): number {
  if (!coverage) return 0;
  return coverage.opportunities.filter((row) => row.territoryOwner === dmName).length;
}

function activeRepsForDm(dmName: string, activeRepsByState: Map<string, number>): number {
  const states = getAssignedStatesForDm(dmName);
  return states.reduce((sum, state) => sum + (activeRepsByState.get(state) ?? 0), 0);
}

function attentionScoreFor(territory: Omit<CommandCenterTerritoryInsight, "attentionScore">): number {
  const coverageGap = Math.max(0, 100 - territory.coveragePercent);
  return coverageGap + territory.openCalls * 2 + Math.max(0, 5 - territory.activeReps) * 3;
}

export function buildCommandCenterRecruitingHealth(input: {
  commandCenter: Pick<
    CommandCenterSnapshot,
    "applicantsLast7Days" | "funnel" | "fetchedAt"
  >;
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState | null;
}): CommandCenterRecruitingHealthSummary {
  const hiredFromFunnel =
    input.commandCenter.funnel.find((row) => row.label === "Hired")?.value ??
    countHiredFromCandidates(input.candidates);

  return {
    applicantsLast7Days:
      input.commandCenter.applicantsLast7Days ||
      countCandidatesLast7Days(input.candidates, input.commandCenter.fetchedAt),
    paperworkSent: input.workflows ? countWorkflowPaperworkSent(input.workflows) : 0,
    readyForMel: input.workflows ? countWorkflowReadyForMel(input.workflows) : 0,
    hired: hiredFromFunnel,
  };
}

export function buildCommandCenterDmInsights(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  fetchedAt: string;
  coverage: CoverageRiskSnapshot | null;
  workflows: CandidateWorkflowState | null;
  commandCenter: Pick<
    CommandCenterSnapshot,
    "applicantsLast7Days" | "funnel" | "fetchedAt"
  >;
}): CommandCenterDmInsightsSnapshot {
  const activeRepsByState = aggregateCoverageByState(input.coverage);

  const territories: CommandCenterTerritoryInsight[] = DISTRICT_MANAGERS.map((dmName) => {
    const states = getAssignedStatesForDm(dmName);
    const stateSet = new Set(states);
    const dmJobs = input.jobs.filter((job) => stateSet.has(normalizeStateCode(job.state)));
    const dmCandidates = input.candidates.filter((candidate) =>
      stateSet.has(normalizeStateCode(candidate.state)),
    );
    const health = buildTerritoryHealthScore(dmJobs, dmCandidates, input.fetchedAt);
    const coveragePercent = health.score;
    const base = {
      dmName,
      states,
      openJobs: dmJobs.length,
      openCalls: openCallsForDm(dmName, input.coverage),
      activeReps: activeRepsForDm(dmName, activeRepsByState),
      coveragePercent,
      coverageTier: resolveCoverageHealthTier(coveragePercent),
    };
    return { ...base, attentionScore: attentionScoreFor(base) };
  });

  const topTerritoriesNeedingAttention = [...territories]
    .sort((a, b) => b.attentionScore - a.attentionScore || a.dmName.localeCompare(b.dmName))
    .slice(0, 5);

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
    if (territory.coveragePercent >= COMMAND_CENTER_DM_COVERAGE_THRESHOLD) continue;
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
    topTerritoriesNeedingAttention,
    recruitingHealth,
    riskAlerts: {
      criticalShortages,
      unstaffedHighPriority,
      belowThreshold: belowThreshold.slice(0, 8),
    },
    hasCoverageData: input.coverage !== null,
  };
}
