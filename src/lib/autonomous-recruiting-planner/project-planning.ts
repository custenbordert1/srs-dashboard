import type { ProjectOutlookStatus, ProjectPlanOutlook } from "@/lib/autonomous-recruiting-planner/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { WorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast/types";

function projectStatus(
  coveragePercent: number,
  riskScore: number,
  openCalls: number,
): ProjectOutlookStatus {
  if (coveragePercent >= 75 && riskScore < 40) return "on-track";
  if (openCalls >= 3 && coveragePercent < 50) return "needs-resources";
  return "needs-intervention";
}

export function buildProjectPlanOutlooks(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
  workforce: WorkforceCapacityForecastSnapshot;
}): ProjectPlanOutlook[] {
  const projectMap = new Map<string, ProjectPlanOutlook>();

  for (const opp of input.bundle.opportunities) {
    if (!opp.openStatus) continue;
    const projectId = opp.projectNo || opp.opportunityId;
    const coverageRow = input.bundle.coverage.opportunities.find(
      (row) => row.opportunityId === opp.opportunityId,
    );
    const coveragePercent = coverageRow?.coverageScore ?? 0;
    const riskRow = input.riskSnapshot.territories.find((row) =>
      row.states.includes(opp.state),
    );
    const riskScore = riskRow?.riskScore ?? 30;
    const openCalls = opp.storeCall === "Open" ? 1 : 0;

    const existing = projectMap.get(projectId);
    const totalOpenCalls = (existing?.openCalls ?? 0) + openCalls;
    const avgCoverage = existing
      ? Math.round((existing.currentCoveragePercent + coveragePercent) / 2)
      : coveragePercent;

    const status = projectStatus(avgCoverage, riskScore, totalOpenCalls);
    const staffingSupport = input.workforce.capacityPlanning.projectsRequiringStaffingSupport.find(
      (row) => row.projectId === projectId || row.projectName === opp.projectName,
    );

    projectMap.set(projectId, {
      projectId,
      projectName: opp.projectName,
      dmName: opp.territoryOwner,
      status,
      currentCoveragePercent: avgCoverage,
      projectedCoveragePercent: Math.min(100, avgCoverage + (status === "on-track" ? 8 : 15)),
      openCalls: totalOpenCalls,
      riskScore,
      reason:
        status === "on-track"
          ? "Coverage and risk within acceptable range"
          : status === "needs-resources"
            ? "Open call volume exceeds current recruiting bench"
            : "Coverage gap requires intervention before deadline",
      recommendedActions: staffingSupport
        ? [`Assign additional recruiter support`, `Escalate to ${opp.territoryOwner}`]
        : status === "needs-intervention"
          ? ["Increase follow-up frequency", "Refresh job posting"]
          : ["Monitor weekly", "Maintain current pace"],
    });
  }

  return [...projectMap.values()].sort((a, b) => {
    const statusOrder: Record<ProjectOutlookStatus, number> = {
      "needs-resources": 0,
      "needs-intervention": 1,
      "on-track": 2,
    };
    if (statusOrder[a.status] !== statusOrder[b.status]) {
      return statusOrder[a.status] - statusOrder[b.status];
    }
    return b.riskScore - a.riskScore;
  });
}
