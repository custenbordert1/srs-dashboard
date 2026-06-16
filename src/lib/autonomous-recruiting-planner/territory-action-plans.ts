import type { TerritoryActionPlan } from "@/lib/autonomous-recruiting-planner/types";
import type { RecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot/types";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { PlannerConfidenceLevel, PlannerEffortLevel } from "@/lib/autonomous-recruiting-planner/types";

function effortFromImpact(impactScore: number): PlannerEffortLevel {
  if (impactScore >= 70) return "high";
  if (impactScore >= 45) return "medium";
  return "low";
}

function confidenceFromScore(score: number): PlannerConfidenceLevel {
  if (score >= 75) return "high";
  if (score >= 55) return "medium";
  return "low";
}

export function buildTerritoryActionPlans(input: {
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
  autopilot: RecruitingAutopilotSnapshot;
  territoryStates?: string[];
}): TerritoryActionPlan[] {
  const territories = input.territoryStates?.length
    ? input.riskSnapshot.territories.filter((row) =>
        row.states.some((state) => input.territoryStates!.includes(state)),
      )
    : input.riskSnapshot.territories;

  return territories
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 12)
    .map((territory) => {
      const territoryAutopilot = input.autopilot.byTerritory[territory.entityId] ?? [];
      const riskActions = territory.recommendations.slice(0, 2).map((rec, index) => {
        const impactScore = Math.min(90, territory.riskScore + 15);
        return {
          id: `risk-${territory.entityId}-${index}`,
          title: rec.label,
          expectedImpact: rec.reason,
          effort: effortFromImpact(impactScore),
          confidence: confidenceFromScore(impactScore),
          impactScore,
          priorityScore: impactScore + territory.riskScore * 0.3,
        };
      });

      const autopilotActions = territoryAutopilot.slice(0, 2).map((rec) => ({
        id: `auto-${rec.id}`,
        title: rec.title,
        expectedImpact: `+${rec.opportunity.estimatedCoverageGain}% coverage, ${rec.opportunity.estimatedCandidateGain} candidates`,
        effort: effortFromImpact(rec.impactScore),
        confidence: confidenceFromScore(rec.confidenceScore),
        impactScore: rec.impactScore,
        priorityScore: rec.prioritizationScore,
      }));

      const actions = [...riskActions, ...autopilotActions]
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 4);

      return {
        territoryId: territory.entityId,
        territoryLabel: territory.label,
        dmName: territory.dmName,
        actions,
      };
    })
    .filter((plan) => plan.actions.length > 0);
}
