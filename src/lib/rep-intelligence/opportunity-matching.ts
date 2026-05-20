import {
  driveRadiusScore,
  milesBetweenRepAndProject,
  territoryProximityScore,
} from "@/lib/rep-intelligence/distance-engine";
import { repReliabilityScore } from "@/lib/rep-intelligence/rep-scoring";
import type { ActiveRep, RepFitLevel, RepOpportunityMatch, RepRiskLevel } from "@/lib/rep-intelligence/rep-types";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";

function skillAlignment(rep: ActiveRep, projectType: string): number {
  const type = projectType.toLowerCase();
  let score = 0;
  for (const skill of rep.skills) {
    if (type.includes(skill)) score += 10;
  }
  return Math.min(30, score);
}

function fitLevelForScore(score: number): RepFitLevel {
  if (score >= 80) return "strong";
  if (score >= 65) return "good";
  if (score >= 50) return "stretch";
  return "poor";
}

function riskLevelForRep(rep: ActiveRep, distanceMiles: number | null): RepRiskLevel {
  if (rep.noShowRate >= 15) return "high";
  if (distanceMiles !== null && distanceMiles > rep.travelRadius * 1.2) return "high";
  if (rep.completionRate < 70 || rep.trainingStatus === "needs_training") return "medium";
  return "low";
}

export function matchRepToOpportunity(
  rep: ActiveRep,
  opportunity: MelOpportunity,
  options?: { territoryStates?: string[] },
): RepOpportunityMatch {
  const distanceMiles = milesBetweenRepAndProject(
    rep,
    { city: opportunity.city, state: opportunity.state },
  );
  const distanceScore = driveRadiusScore(distanceMiles, rep.travelRadius);
  const territoryScore = territoryProximityScore(rep.state, opportunity.state, options?.territoryStates);
  const reliability = Math.round(repReliabilityScore(rep) * 0.25);
  const skills = skillAlignment(rep, opportunity.projectType);
  const utilizationPenalty = rep.openAssignments >= 6 ? 8 : rep.openAssignments >= 4 ? 4 : 0;

  const raw = distanceScore + territoryScore + reliability + skills - utilizationPenalty;
  const matchScore = Math.min(99, Math.max(5, Math.round(raw)));
  const fitLevel = fitLevelForScore(matchScore);
  const riskLevel = riskLevelForRep(rep, distanceMiles);

  const strengths: string[] = [];
  const concerns: string[] = [];

  if (skills >= 15) strengths.push(`Skills align with ${opportunity.projectType}`);
  if (rep.completionRate >= 85) strengths.push("High completion rate on recent projects");
  if (distanceMiles !== null && distanceMiles <= rep.travelRadius) {
    strengths.push(`Within ${Math.round(distanceMiles)} mi drive radius`);
  }
  if (rep.noShowRate > 10) concerns.push("Elevated no-show rate");
  if (rep.openAssignments >= 5) concerns.push("High current workload");
  if (distanceMiles !== null && distanceMiles > rep.travelRadius) {
    concerns.push("Outside preferred travel radius");
  }

  let recommendedAction = "Monitor — assign if no stronger rep available";
  if (fitLevel === "strong") recommendedAction = "Assign now — strong coverage fit";
  else if (fitLevel === "good") recommendedAction = "Recommend for staffing review";
  else if (riskLevel === "high") recommendedAction = "Escalate — backup rep or travel approval needed";

  return {
    matchScore,
    fitLevel,
    riskLevel,
    recommendedAction,
    strengths,
    concerns,
    distanceMiles,
  };
}
