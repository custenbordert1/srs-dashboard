import { matchRepToOpportunity } from "@/lib/rep-intelligence/opportunity-matching";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { CoverageGap } from "@/lib/rep-intelligence/rep-types";

export type StaffingRecommendationPriority = "critical" | "high" | "medium";

export type StaffingRecommendation = {
  id: string;
  priority: StaffingRecommendationPriority;
  title: string;
  summary: string;
  recommendedAction: string;
  projectName?: string;
  client?: string;
  repName?: string;
  distanceMiles?: number | null;
  matchScore?: number;
};

function priorityFromScore(score: number): StaffingRecommendationPriority {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  return "medium";
}

export function buildStaffingRecommendations(input: {
  reps: ActiveRep[];
  opportunities: MelOpportunity[];
  coverageGaps: CoverageGap[];
  territoryStates?: string[];
}): StaffingRecommendation[] {
  const recommendations: StaffingRecommendation[] = [];
  const openUnstaffed = input.opportunities.filter((o) => o.openStatus && !o.isStaffed);

  for (const gap of input.coverageGaps.filter((g) => g.health === "red").slice(0, 5)) {
    recommendations.push({
      id: `gap-${gap.territory}`,
      priority: "critical",
      title: `Coverage gap: ${gap.territory}`,
      summary: `${gap.openProjects} open projects with only ${gap.activeReps} active reps in territory.`,
      recommendedAction: "Escalate recruiting radius or pull backup reps from adjacent markets.",
    });
  }

  for (const opportunity of openUnstaffed.filter((o) => o.priority === "high").slice(0, 8)) {
    let bestRep: ActiveRep | null = null;
    let bestMatch: ReturnType<typeof matchRepToOpportunity> | null = null;

    for (const rep of input.reps.filter((r) => r.active)) {
      const match = matchRepToOpportunity(rep, opportunity, { territoryStates: input.territoryStates });
      if (!bestRep || !bestMatch || match.matchScore > bestMatch.matchScore) {
        bestRep = rep;
        bestMatch = match;
      }
    }

    if (bestRep && bestMatch && bestMatch.matchScore >= 65) {
      recommendations.push({
        id: `assign-${opportunity.opportunityId}`,
        priority: priorityFromScore(100 - bestMatch.matchScore),
        title: `Staff ${opportunity.projectName}`,
        summary: `${bestRep.name} is a ${bestMatch.fitLevel} fit (${bestMatch.matchScore}%) for this high-priority ${opportunity.client} program.`,
        recommendedAction: bestMatch.recommendedAction,
        projectName: opportunity.projectName,
        client: opportunity.client,
        repName: bestRep.name,
        distanceMiles: bestMatch.distanceMiles,
        matchScore: bestMatch.matchScore,
      });
    } else {
      recommendations.push({
        id: `risk-${opportunity.opportunityId}`,
        priority: "critical",
        title: `No strong rep for ${opportunity.storeName}`,
        summary: `High-priority open store call in ${opportunity.state} lacks a qualified rep within travel radius.`,
        recommendedAction: "Expand candidate outreach or approve travel exception for regional rep.",
        projectName: opportunity.projectName,
        client: opportunity.client,
      });
    }
  }

  const overloaded = input.reps.filter((r) => r.openAssignments >= 5);
  for (const rep of overloaded.slice(0, 3)) {
    recommendations.push({
      id: `util-${rep.repId}`,
      priority: "medium",
      title: `${rep.name} at capacity`,
      summary: `${rep.openAssignments} open assignments may impact completion quality.`,
      recommendedAction: "Rebalance workload before assigning additional high-priority stores.",
      repName: rep.name,
    });
  }

  return recommendations
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2 };
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 15);
}
