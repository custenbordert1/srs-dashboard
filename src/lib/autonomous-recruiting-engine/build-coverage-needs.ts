import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { buildCoverageIntelligence } from "@/lib/dm-dashboard/coverage-intelligence";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { buildTerritoryShortageForecast } from "@/lib/executive-recruiting-forecast/territory-shortage";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { buildPipelineCountsByState } from "@/lib/coverage-risk-engine/pipeline-signal";
import type { CoverageStatus, TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";

function resolveCoverageStatus(score: number, projectedShortage: number): CoverageStatus {
  if (score >= 80 || projectedShortage >= 3) return "Critical";
  if (score >= 60 || projectedShortage >= 2) return "At Risk";
  if (score >= 40) return "Watch";
  return "Healthy";
}

function resolveRecommendedAction(status: CoverageStatus, drivers: string[]): string {
  if (status === "Critical") {
    return "Launch urgent posting and recruiter blitz — territory likely to miss coverage.";
  }
  if (status === "At Risk") {
    return "Increase applicant flow and prioritize interview scheduling in this territory.";
  }
  if (status === "Watch") {
    return "Monitor pipeline velocity and refresh aging ads if applicant flow stalls.";
  }
  if (drivers.some((d) => d.includes("pipeline"))) {
    return "Maintain current coverage — reinforce pipeline depth before next project wave.";
  }
  return "No immediate action — coverage is within target.";
}

export function buildCoverageNeeds(input: {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  opportunities: MelOpportunity[];
  fetchedAt: string;
  territoryStates?: string[];
}): TerritoryCoverageNeed[] {
  const territoryShortages = buildTerritoryShortageForecast({
    candidates: input.candidates,
    workflows: input.workflows,
    opportunities: input.opportunities,
  });
  const coverageIntel = buildCoverageIntelligence(input.jobs, input.candidates, input.fetchedAt);
  const pipelineByState = buildPipelineCountsByState(input.candidates, input.territoryStates);

  const problemCities = new Set(coverageIntel.topProblemCities.map((row) => row.label));
  const hardTerritories = new Map(
    coverageIntel.hardestToFillTerritories.map((row) => [row.label, row.value]),
  );
  const stateShortage = new Map(
    coverageIntel.candidateShortagesByState.map((row) => [row.label, row.value]),
  );

  const applicantsByDm = new Map<string, number>();
  for (const candidate of input.candidates) {
    const state = normalizeStateCode(candidate.state ?? "");
    const dm = getDmForState(state) ?? "Unassigned";
    applicantsByDm.set(dm, (applicantsByDm.get(dm) ?? 0) + 1);
  }

  const needs: TerritoryCoverageNeed[] = territoryShortages.map((row) => {
    const drivers = [...row.reasons];
    let score = row.shortageScore;

    const hardScore = hardTerritories.get(row.dmName) ?? 0;
    if (hardScore >= 15) {
      drivers.push("Hardest-to-fill territory signal from Breezy aging jobs");
      score = Math.min(100, score + 8);
    }

    for (const state of row.territoryLabel.split(",").map((s) => normalizeStateCode(s.trim()))) {
      const gap = stateShortage.get(state) ?? 0;
      if (gap >= 2) {
        drivers.push(`${state}: candidate shortage vs open jobs (${gap})`);
        score = Math.min(100, score + gap * 3);
      }
      const pipeline = pipelineByState.get(state);
      if (pipeline && pipeline.totalActive <= 1 && row.openOpportunities > 0) {
        drivers.push(`${state}: weak recruiting pipeline (${pipeline.totalActive} active applicants)`);
        score = Math.min(100, score + 10);
      }
    }

    const hasProblemCity = [...problemCities].some((city) =>
      row.territoryLabel.toLowerCase().includes(city.split(",")[0]?.toLowerCase() ?? ""),
    );
    if (hasProblemCity) {
      drivers.push("Problem city detected — low recent applicant velocity");
      score = Math.min(100, score + 6);
    }

    if (row.likelyMissCoverage) {
      drivers.push("Executive forecast flags likely coverage miss");
      score = Math.min(100, score + 5);
    }

    const coverageStatus = resolveCoverageStatus(score, row.projectedShortage);
    const uniqueDrivers = [...new Set(drivers)].slice(0, 6);

    return {
      territoryKey: row.dmName,
      territoryLabel: row.territoryLabel,
      dmName: row.dmName,
      states: row.territoryLabel.split(",").map((s) => normalizeStateCode(s.trim())).filter(Boolean),
      openCalls: row.openOpportunities,
      activeReps: row.activeReps,
      pipelineCandidates: row.pipelineCandidates,
      applicantCount: applicantsByDm.get(row.dmName) ?? 0,
      coverageStatus,
      coverageNeedScore: Math.round(Math.min(100, Math.max(0, score))),
      drivers: uniqueDrivers,
      recommendedAction: resolveRecommendedAction(coverageStatus, uniqueDrivers),
    };
  });

  return needs.sort(
    (a, b) => b.coverageNeedScore - a.coverageNeedScore || b.openCalls - a.openCalls,
  );
}
