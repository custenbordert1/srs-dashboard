import type { RecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot/types";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { RiskConstraintSummary } from "@/lib/autonomous-recruiting-planner/types";
import type { WorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast/types";

export function buildRiskConstraintSummary(input: {
  workforce: WorkforceCapacityForecastSnapshot;
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
  autopilot: RecruitingAutopilotSnapshot;
  recoverableCandidates: number;
}): RiskConstraintSummary {
  const overloadedRecruiters = input.workforce.recruiterCapacity.filter(
    (row) => row.state === "overloaded" || row.needsHelp,
  ).length;
  const dmsAtRisk = input.workforce.dmCapacity.filter((row) => row.atRisk).length;
  const criticalTerritories = input.riskSnapshot.executiveSummary.totalCriticalTerritories;
  const lowRecovery = input.recoverableCandidates < 3;

  const constraints: string[] = [];
  if (overloadedRecruiters > 0) {
    constraints.push(
      `${overloadedRecruiters} recruiter(s) near capacity — reassign before adding territory blitz`,
    );
  }
  if (dmsAtRisk > 0) {
    constraints.push(`${dmsAtRisk} DM(s) at risk — prioritize follow-up backlog clearance`);
  }
  if (criticalTerritories > 0) {
    constraints.push(
      `${criticalTerritories} critical territor${criticalTerritories === 1 ? "y" : "ies"} — risk actions required first`,
    );
  }
  if (lowRecovery) {
    constraints.push("Limited recoverable candidates — re-engagement yield may be capped");
  }
  if (input.autopilot.executiveSummary.topActionsToday.length === 0) {
    constraints.push("No high-confidence autopilot actions — plan relies on baseline velocity");
  }

  return {
    recruiterCapacityBlocked: overloadedRecruiters,
    dmCapacityBlocked: dmsAtRisk,
    territoryRiskBlocked: criticalTerritories,
    candidateAvailabilityBlocked: lowRecovery ? 1 : 0,
    constraints,
  };
}
