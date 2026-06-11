import { countCandidatesLast7Days, type BreezyCandidate, type BreezyJob } from "@/lib/breezy-api";
import { DISTRICT_MANAGERS, getAssignedStatesForDm, normalizeStateCode } from "@/lib/dm-territory-map";
import { buildCoverageIntelligence } from "@/lib/dm-dashboard/coverage-intelligence";
import { buildTerritoryHealthScore } from "@/lib/dm-dashboard/territory-health-score";
import { countBuckets, MS_PER_DAY, parseDate } from "@/lib/dm-dashboard/territory-shared";
import { buildExecutiveInsightsKpis, type ExecutiveInsightsKpis } from "@/lib/executive-insights-engine";
import {
  buildExecutiveMelMatchingMetrics,
  type ExecutiveMelMatchingMetrics,
} from "@/lib/mel-matching/mel-matching-metrics";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ChartBar } from "@/lib/recruiting-intelligence";

export type TerritoryRollupRow = {
  dmName: string;
  states: string[];
  healthScore: number;
  healthLabel: string;
  activeJobs: number;
  candidates: number;
  candidatesLast7Days: number;
  fillRiskCount: number;
};

export type ExecutiveDashboardSnapshot = {
  fetchedAt: string;
  bestTerritories: TerritoryRollupRow[];
  worstTerritories: TerritoryRollupRow[];
  topRecruitingSources: ChartBar[];
  fillRateTrends: ChartBar[];
  candidatesByWeek: ChartBar[];
  territoryRollups: TerritoryRollupRow[];
  nationwideHealthScore: number;
  executiveInsights: ExecutiveInsightsKpis;
  melMatching: ExecutiveMelMatchingMetrics;
};

function weeklyCandidateBuckets(candidates: BreezyCandidate[], referenceIso: string): ChartBar[] {
  const reference = new Date(referenceIso);
  const buckets: ChartBar[] = [];
  for (let week = 7; week >= 0; week -= 1) {
    const start = new Date(reference.getTime() - (week + 1) * 7 * MS_PER_DAY);
    const end = new Date(reference.getTime() - week * 7 * MS_PER_DAY);
    const label = week === 0 ? "This week" : week === 1 ? "Last week" : `W-${week}`;
    let count = 0;
    for (const candidate of candidates) {
      const applied = parseDate(candidate.appliedDate);
      if (applied && applied >= start && applied < end) count += 1;
    }
    buckets.push({ label, value: count });
  }
  return buckets;
}

function fillRateTrends(jobs: BreezyJob[], candidates: BreezyCandidate[]): ChartBar[] {
  const hired = candidates.filter((c) => {
    const stage = c.stage.toLowerCase();
    return stage.includes("hired") || stage.includes("offer") || stage.includes("placed");
  }).length;
  const interviewing = candidates.filter((c) => {
    const stage = c.stage.toLowerCase();
    return stage.includes("interview") || stage.includes("screen");
  }).length;
  const applied = Math.max(0, candidates.length - hired - interviewing);

  const total = candidates.length || 1;
  return [
    { label: "Applied", value: Math.round((applied / total) * 100) },
    { label: "Interviewing", value: Math.round((interviewing / total) * 100) },
    { label: "Hired", value: Math.round((hired / total) * 100) },
  ];
}

export function buildExecutiveDashboard(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
  melOpportunities: MelOpportunity[] = [],
): ExecutiveDashboardSnapshot {
  const rollups: TerritoryRollupRow[] = DISTRICT_MANAGERS.map((dmName) => {
    const states = getAssignedStatesForDm(dmName);
    const stateSet = new Set(states);
    const dmJobs = jobs.filter((j) => stateSet.has(normalizeStateCode(j.state)));
    const dmCandidates = candidates.filter((c) => stateSet.has(normalizeStateCode(c.state)));
    const health = buildTerritoryHealthScore(dmJobs, dmCandidates, fetchedAt);
    const coverage = buildCoverageIntelligence(dmJobs, dmCandidates, fetchedAt);

    return {
      dmName,
      states,
      healthScore: health.score,
      healthLabel: health.label,
      activeJobs: dmJobs.length,
      candidates: dmCandidates.length,
      candidatesLast7Days: countCandidatesLast7Days(dmCandidates, fetchedAt),
      fillRiskCount: coverage.topProblemCities.reduce((sum, row) => sum + row.value, 0),
    };
  });

  const sorted = [...rollups].sort((a, b) => b.healthScore - a.healthScore);
  const nationwideHealth = buildTerritoryHealthScore(jobs, candidates, fetchedAt);

  return {
    fetchedAt,
    bestTerritories: sorted.slice(0, 10),
    worstTerritories: [...sorted].reverse().slice(0, 10),
    topRecruitingSources: countBuckets(
      candidates.map((c) => ({ label: c.source.trim() || "Unknown" })),
      (r) => r.label,
      10,
    ),
    fillRateTrends: fillRateTrends(jobs, candidates),
    candidatesByWeek: weeklyCandidateBuckets(candidates, fetchedAt),
    territoryRollups: rollups,
    nationwideHealthScore: nationwideHealth.score,
    executiveInsights: buildExecutiveInsightsKpis(jobs, candidates, fetchedAt),
    melMatching: buildExecutiveMelMatchingMetrics(candidates, melOpportunities),
  };
}
