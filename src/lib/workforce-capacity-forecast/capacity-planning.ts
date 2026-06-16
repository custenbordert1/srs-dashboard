import type {
  CapacityPlanningDashboard,
  DmCapacityRow,
  RecruiterCapacityRow,
} from "@/lib/workforce-capacity-forecast/types";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

export function buildCapacityPlanningDashboard(input: {
  recruiterCapacity: RecruiterCapacityRow[];
  dmCapacity: DmCapacityRow[];
  bundle: RecruitingIntelligenceRouteBundle;
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
}): CapacityPlanningDashboard {
  const recruitersNeedingHelp = input.recruiterCapacity
    .filter((row) => row.needsHelp || row.state === "overloaded")
    .sort((a, b) => b.capacityPercent - a.capacityPercent);

  const recruitersWithSpareCapacity = input.recruiterCapacity
    .filter((row) => row.state === "underutilized" || row.spareCapacityPercent >= 30)
    .sort((a, b) => b.spareCapacityPercent - a.spareCapacityPercent);

  const dmsAtRisk = input.dmCapacity
    .filter((row) => row.atRisk)
    .sort((a, b) => a.capacityScore - b.capacityScore);

  const projectRisk = new Map<
    string,
    { projectName: string; dmName: string; openCalls: number; coveragePercent: number; riskScore: number }
  >();

  for (const project of input.riskSnapshot.projects) {
    if (project.openCalls <= 0) continue;
    if (project.riskLevel !== "critical" && project.riskLevel !== "high") continue;
    projectRisk.set(project.entityId, {
      projectName: project.label,
      dmName: project.dmName,
      openCalls: project.openCalls,
      coveragePercent: project.coveragePercent,
      riskScore: project.riskScore,
    });
  }

  for (const opp of input.bundle.opportunities) {
    if (!opp.openStatus || opp.isStaffed) continue;
    const coverageRow = input.bundle.coverage.opportunities.find(
      (row) => row.opportunityId === opp.opportunityId,
    );
    if (!coverageRow || coverageRow.coverageScore >= 55) continue;
    const key = opp.projectName || opp.opportunityId;
    const existing = projectRisk.get(key);
    if (existing) {
      existing.openCalls += 1;
      existing.coveragePercent = Math.min(existing.coveragePercent, coverageRow.coverageScore);
    } else {
      projectRisk.set(key, {
        projectName: opp.projectName || key,
        dmName: opp.territoryOwner ?? "Unassigned",
        openCalls: 1,
        coveragePercent: coverageRow.coverageScore,
        riskScore: 100 - coverageRow.coverageScore,
      });
    }
  }

  const projectsRequiringStaffingSupport = [...projectRisk.entries()]
    .map(([projectId, row]) => ({ projectId, ...row }))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 12);

  return {
    recruitersNeedingHelp,
    recruitersWithSpareCapacity,
    dmsAtRisk,
    projectsRequiringStaffingSupport,
  };
}
