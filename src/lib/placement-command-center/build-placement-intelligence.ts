import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  HiringRecommendation,
  TerritoryCoverageNeed,
} from "@/lib/autonomous-recruiting-engine/types";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { matchCandidateToOpportunities } from "@/lib/mel-matching/matching-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { HiringReadinessRow } from "@/lib/placement-command-center/types";
import type {
  PlacementConfidence,
  PlacementRecommendation,
} from "@/lib/placement-command-center/types";

function confidenceFromScore(score: number, matchLabel: string): PlacementConfidence {
  if (score >= 78 || matchLabel === "Strong Match") return "high";
  if (score >= 62 || matchLabel === "Good Match") return "medium";
  return "low";
}

function coverageUrgencyForRow(
  row: ScoredCandidateWorkflowRow,
  coverageNeeds: TerritoryCoverageNeed[],
): TerritoryCoverageNeed["coverageStatus"] {
  const state = normalizeStateCode(row.state ?? "");
  const dm = getDmForState(state) ?? "Unassigned";
  const need = coverageNeeds.find((entry) => entry.dmName === dm || entry.states.includes(state));
  return need?.coverageStatus ?? "Healthy";
}

function urgencyBoost(status: TerritoryCoverageNeed["coverageStatus"]): number {
  if (status === "Critical") return 12;
  if (status === "At Risk") return 8;
  if (status === "Watch") return 4;
  return 0;
}

export function buildPlacementRecommendations(input: {
  scoredRows: ScoredCandidateWorkflowRow[];
  readiness: HiringReadinessRow[];
  opportunities: MelOpportunity[];
  coverageNeeds: TerritoryCoverageNeed[];
  hiringRecommendations: HiringRecommendation[];
  territoryStates?: string[];
  limit?: number;
}): PlacementRecommendation[] {
  const limit = input.limit ?? 25;
  const readinessById = new Map(input.readiness.map((row) => [row.candidateId, row]));
  const hireNowIds = new Set(
    input.hiringRecommendations
      .filter((row) => row.recommendedAction === "Hire Now")
      .map((row) => row.candidateId),
  );

  const candidates = input.scoredRows.filter((row) => {
    const readiness = readinessById.get(row.candidateId);
    if (!readiness) return false;
    if (readiness.status === "blocked") return false;
    return readiness.status === "ready-to-place" || hireNowIds.has(row.candidateId);
  });

  const recommendations: PlacementRecommendation[] = [];

  for (const row of candidates) {
    const readiness = readinessById.get(row.candidateId)!;
    const match = matchCandidateToOpportunities(row, input.opportunities, {
      territoryStates: input.territoryStates,
      limit: 1,
      openOnly: true,
    });
    const top = match.matches[0];
    if (!top) continue;

    const coverageUrgency = coverageUrgencyForRow(row, input.coverageNeeds);
    const placementScore = Math.min(
      99,
      Math.round(top.fitPercent + urgencyBoost(coverageUrgency) + (readiness.readyForMel ? 5 : 0)),
    );

    const reasons = [top.summary];
    if (coverageUrgency === "Critical") reasons.push("Critical territory coverage pressure.");
    if (readiness.readyForMel) reasons.push("Candidate is ready for MEL load.");
    if (top.distanceMiles !== null) reasons.push(`Territory distance ~${Math.round(top.distanceMiles)} mi.`);

    recommendations.push({
      candidateId: row.candidateId,
      candidateName: readiness.candidateName,
      placementScore,
      confidence: confidenceFromScore(placementScore, top.matchLabel),
      recommendedTerritory: top.territory || readiness.territory,
      recommendedProject: top.projectName,
      recommendedProjectId: top.opportunityId,
      distanceMiles: top.distanceMiles,
      coverageUrgency,
      readinessStatus: readiness.status,
      reasons: [...new Set(reasons)].slice(0, 4),
    });
  }

  return recommendations
    .sort((a, b) => b.placementScore - a.placementScore || a.distanceMiles! - b.distanceMiles!)
    .slice(0, limit);
}
