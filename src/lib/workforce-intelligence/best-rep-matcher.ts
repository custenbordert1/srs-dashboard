import { matchRepToOpportunity } from "@/lib/rep-intelligence/opportunity-matching";
import type { ActiveRep, BestRepMatchRow, OpportunityBestRepMatches } from "@/lib/rep-intelligence/rep-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";

function skillOverlapList(rep: ActiveRep, opportunity: MelOpportunity): string[] {
  const type = opportunity.projectType.toLowerCase();
  const client = opportunity.client.toLowerCase();
  return rep.skills.filter(
    (skill) => type.includes(skill) || client.includes(skill) || skill.length >= 3,
  );
}

function buildRecommendationReason(
  rep: ActiveRep,
  match: ReturnType<typeof matchRepToOpportunity>,
  overlap: string[],
): string {
  const parts: string[] = [];
  if (!rep.active) parts.push("Rep marked inactive in workforce file");
  else if (rep.lastLoginDaysAgo != null && rep.lastLoginDaysAgo <= 7) {
    parts.push("Logged in within the last week");
  } else if (rep.lastLoginDaysAgo != null && rep.lastLoginDaysAgo <= 30) {
    parts.push("Recent platform activity");
  } else if (rep.lastLoginDaysAgo != null && rep.lastLoginDaysAgo > 60) {
    parts.push("Stale login — verify availability");
  }

  if (overlap.length > 0) parts.push(`Skill overlap: ${overlap.slice(0, 3).join(", ")}`);
  if (match.distanceMiles !== null && match.distanceMiles <= rep.travelRadius) {
    parts.push(`Within ${Math.round(match.distanceMiles)} miles`);
  }
  if (match.strengths[0]) parts.push(match.strengths[0]!);
  return parts.length > 0 ? parts.join(". ") : match.recommendedAction;
}

export function rankRepsForOpportunity(
  reps: ActiveRep[],
  opportunity: MelOpportunity,
  options?: { territoryStates?: string[]; limit?: number },
): BestRepMatchRow[] {
  const limit = options?.limit ?? 3;
  const rows: BestRepMatchRow[] = [];

  for (const rep of reps) {
    const match = matchRepToOpportunity(rep, opportunity, { territoryStates: options?.territoryStates });
    const overlap = skillOverlapList(rep, opportunity);
    rows.push({
      repId: rep.repId,
      repName: rep.name,
      srsId: rep.srsId ?? rep.repId,
      matchScore: match.matchScore,
      fitLevel: match.fitLevel,
      distanceMiles: match.distanceMiles,
      skillOverlap: overlap,
      recommendationReason: buildRecommendationReason(rep, match, overlap),
      lastLoginDaysAgo: rep.lastLoginDaysAgo ?? null,
      active: rep.active,
    });
  }

  return rows
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const da = a.distanceMiles ?? 9999;
      const db = b.distanceMiles ?? 9999;
      return da - db;
    })
    .slice(0, limit);
}

export function rankRepsForOpportunities(
  reps: ActiveRep[],
  opportunities: MelOpportunity[],
  options?: { territoryStates?: string[]; limitPerOpportunity?: number },
): OpportunityBestRepMatches[] {
  return opportunities.map((opportunity) => ({
    opportunityId: opportunity.opportunityId,
    projectName: opportunity.projectName,
    topReps: rankRepsForOpportunity(reps, opportunity, {
      territoryStates: options?.territoryStates,
      limit: options?.limitPerOpportunity ?? 3,
    }),
  }));
}
