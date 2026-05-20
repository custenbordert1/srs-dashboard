import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { matchRepToOpportunity } from "@/lib/rep-intelligence/opportunity-matching";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { rankRepsForOpportunity } from "@/lib/workforce-intelligence/best-rep-matcher";
import { countRepsNearOpportunity } from "@/lib/coverage-risk-engine/rep-proximity";
import {
  pipelineScoreForState,
  type StatePipelineCounts,
} from "@/lib/coverage-risk-engine/pipeline-signal";
import type {
  OpportunityCoverageRow,
  StaffingRiskLevel,
} from "@/lib/coverage-risk-engine/types";

function skillMatchScoreForOpportunity(reps: ActiveRep[], opportunity: MelOpportunity): number {
  let best = 0;
  for (const rep of reps.filter((r) => r.active)) {
    const match = matchRepToOpportunity(rep, opportunity);
    const skillComponent = Math.min(35, match.matchScore * 0.35);
    if (skillComponent > best) best = skillComponent;
  }
  return Math.round(best);
}

function recentLoginScore(reps: ActiveRep[], opportunity: MelOpportunity): number {
  const nearby = reps.filter((r) => {
    const miles = matchRepToOpportunity(r, opportunity).distanceMiles;
    return miles !== null && miles <= 50 && r.active;
  });
  if (nearby.length === 0) return 0;
  const recent = nearby.filter((r) => r.lastLoginDaysAgo != null && r.lastLoginDaysAgo <= 14).length;
  return Math.round((recent / nearby.length) * 100);
}

function territoryAlignmentScore(
  reps: ActiveRep[],
  opportunity: MelOpportunity,
  territoryStates?: string[],
): number {
  const state = normalizeStateCode(opportunity.state);
  const dm = opportunity.territoryOwner || getDmForState(state) || "";
  const repsInState = reps.filter(
    (r) => r.active && normalizeStateCode(r.state) === state,
  ).length;
  let score = Math.min(40, repsInState * 8);
  if (territoryStates?.includes(state)) score += 15;
  if (dm && dm !== "Unassigned") score += 10;
  const dmReps = reps.filter((r) => r.active && r.dmOwner === dm).length;
  if (dmReps > 0) score += Math.min(15, dmReps * 3);
  return Math.min(100, score);
}

function activeRepDensityScore(nearby: ReturnType<typeof countRepsNearOpportunity>): number {
  const active10 = nearby.within10;
  const active25 = nearby.within25;
  const active50 = nearby.activeWithin50;
  if (active10 >= 3) return 100;
  if (active10 >= 2) return 85;
  if (active10 >= 1) return 70;
  if (active25 >= 2) return 55;
  if (active25 >= 1) return 42;
  if (active50 >= 2) return 30;
  if (active50 >= 1) return 18;
  return 0;
}

export function classifyStaffingRisk(input: {
  coverageScore: number;
  nearby: ReturnType<typeof countRepsNearOpportunity>;
  skillMatchScore: number;
  pipelineScore: number;
  activeRepsInState: number;
}): StaffingRiskLevel {
  const { coverageScore, nearby, skillMatchScore, pipelineScore, activeRepsInState } = input;

  if (
    nearby.activeWithin50 === 0 &&
    (activeRepsInState === 0 || skillMatchScore < 10)
  ) {
    return "RED";
  }

  if (coverageScore < 35) return "RED";
  if (nearby.activeWithin50 === 0) return "RED";
  if (nearby.activeWithin50 > 0 && nearby.inactiveWithin50 > nearby.activeWithin50 * 2) {
    return "YELLOW";
  }
  if (skillMatchScore < 8 && nearby.within25 <= 1) return "RED";

  if (coverageScore >= 65 && nearby.within25 >= 2 && pipelineScore >= 35) return "GREEN";
  if (coverageScore >= 55 && nearby.activeWithin50 >= 2) return "GREEN";

  if (coverageScore < 65 || pipelineScore < 30 || nearby.within25 <= 1) return "YELLOW";
  return "GREEN";
}

function recommendedActionForRisk(
  risk: StaffingRiskLevel,
  nearby: ReturnType<typeof countRepsNearOpportunity>,
  pipelineScore: number,
): string {
  if (risk === "RED") {
    if (nearby.activeWithin50 === 0) {
      return "Urgent — recruit and activate reps within 50 miles; no viable coverage.";
    }
    return "Escalate staffing — limited active coverage; verify rep availability.";
  }
  if (risk === "YELLOW") {
    if (pipelineScore < 30) {
      return "Increase recruiting velocity — coverage is thin and candidate pipeline is weak.";
    }
    return "Monitor closely — assign backup rep or expand search radius.";
  }
  return "Adequate coverage — assign best-matched active rep.";
}

export function scoreOpportunityCoverage(
  opportunity: MelOpportunity,
  reps: ActiveRep[],
  pipelineByState: Map<string, StatePipelineCounts>,
  options?: { territoryStates?: string[] },
): OpportunityCoverageRow {
  const nearby = countRepsNearOpportunity(reps, opportunity);
  const state = normalizeStateCode(opportunity.state);
  const pipelineCounts = pipelineByState.get(state);
  const pipelineScore = pipelineScoreForState(pipelineCounts);
  const density = activeRepDensityScore(nearby);
  const skillMatch = skillMatchScoreForOpportunity(reps, opportunity);
  const loginScore = recentLoginScore(reps, opportunity);
  const territoryScore = territoryAlignmentScore(reps, opportunity, options?.territoryStates);
  const activeRepsInState = reps.filter(
    (r) => r.active && normalizeStateCode(r.state) === state,
  ).length;

  const rawCoverage =
    density * 0.35 +
    skillMatch * 0.2 +
    loginScore * 0.15 +
    territoryScore * 0.15 +
    pipelineScore * 0.15;

  let coverageScore = Math.round(Math.min(100, Math.max(0, rawCoverage)));
  if (nearby.activeWithin50 === 0) coverageScore = Math.min(coverageScore, 30);
  if (skillMatch < 5) coverageScore = Math.min(coverageScore, 45);

  const staffingRisk = classifyStaffingRisk({
    coverageScore,
    nearby,
    skillMatchScore: skillMatch,
    pipelineScore,
    activeRepsInState,
  });

  const topRecommendedReps = rankRepsForOpportunity(reps, opportunity, {
    territoryStates: options?.territoryStates,
    limit: 5,
  });

  return {
    opportunityId: opportunity.opportunityId,
    projectName: opportunity.projectName,
    client: opportunity.client,
    storeName: opportunity.storeName,
    city: opportunity.city,
    state,
    territoryOwner: opportunity.territoryOwner,
    priority: opportunity.priority,
    nearby: {
      within10: nearby.within10,
      within25: nearby.within25,
      within50: nearby.within50,
      activeWithin50: nearby.activeWithin50,
      inactiveWithin50: nearby.inactiveWithin50,
    },
    activeRepDensity: density,
    skillMatchScore: skillMatch,
    recentLoginScore: loginScore,
    territoryAlignmentScore: territoryScore,
    pipelineScore,
    coverageScore,
    staffingRisk,
    recommendedAction: recommendedActionForRisk(staffingRisk, nearby, pipelineScore),
    topRecommendedReps,
  };
}
