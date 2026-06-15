import { buildTerritoryIntelligenceCenter } from "@/lib/territory-intelligence";
import {
  buildTerritoryActionCenterSnapshot,
  type TerritoryActionBuildContext,
} from "@/lib/territory-action-engine";
import { buildCompanyHealthScore } from "@/lib/executive-operations-center/build-company-health-score";
import { buildProjectWarRoomRows } from "@/lib/executive-operations-center/build-project-war-room";
import { buildTerritoryWarRoomRows } from "@/lib/executive-operations-center/build-territory-war-room";
import { buildRecruiterWarRoomRows } from "@/lib/executive-operations-center/build-recruiter-war-room";
import { buildProjectForecastRows } from "@/lib/executive-operations-center/build-project-forecast";
import type {
  ExecutiveOperationsCenterSnapshot,
  ExecutiveRiskSummary,
} from "@/lib/executive-operations-center/types";

function riskSummary(
  id: string,
  label: string,
  count: number,
  topIssue: string,
): ExecutiveRiskSummary {
  return { id, label, count, topIssue };
}

export function buildExecutiveOperationsCenterSnapshot(
  ctx: TerritoryActionBuildContext,
): ExecutiveOperationsCenterSnapshot {
  const territoryCenter = buildTerritoryIntelligenceCenter({
    jobs: ctx.jobs,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    coverage: ctx.coverage,
    workflows: ctx.workflows,
  });

  const actionCenter = buildTerritoryActionCenterSnapshot(ctx);

  const companyHealth = buildCompanyHealthScore({
    coverage: ctx.coverage,
    territoryCenter,
    candidates: ctx.candidates,
    fetchedAt: ctx.fetchedAt,
    recruiterWorkloads: actionCenter.recruiterWorkloads,
    projectRisks: actionCenter.projectRisks,
    criticalActionCount: actionCenter.meta.criticalCount,
  });

  const projectWarRoom = buildProjectWarRoomRows(ctx.coverage, ctx.candidates);
  const territoryWarRoom = buildTerritoryWarRoomRows(
    territoryCenter.territories,
    actionCenter.repCapacities,
  );
  const recruiterWarRoom = buildRecruiterWarRoomRows(actionCenter.recruiterWorkloads);
  const projectForecasts = buildProjectForecastRows(ctx.coverage);

  const criticalProjects = projectWarRoom.filter((row) => row.riskLevel === "critical");
  const atRiskTerritories = territoryWarRoom.filter(
    (row) => row.riskTier === "critical" || row.riskTier === "at-risk",
  );
  const overloadedRecruiters = recruiterWarRoom.filter((row) => row.status !== "balanced");
  const coverageGaps = ctx.coverage.executiveSummary.highRiskProjectCount;

  return {
    fetchedAt: ctx.fetchedAt,
    companyHealth,
    riskSummaries: {
      criticalActions: riskSummary(
        "critical-actions",
        "Critical Actions",
        actionCenter.meta.criticalCount,
        actionCenter.actionBoard[0]?.issue ?? "No critical actions",
      ),
      projectRisk: riskSummary(
        "project-risk",
        "Project Risk",
        criticalProjects.length,
        criticalProjects[0]?.projectName ?? "No critical projects",
      ),
      territoryRisk: riskSummary(
        "territory-risk",
        "Territory Risk",
        atRiskTerritories.length,
        atRiskTerritories[0]?.dmName ?? "Territories stable",
      ),
      recruiterRisk: riskSummary(
        "recruiter-risk",
        "Recruiter Risk",
        overloadedRecruiters.length,
        overloadedRecruiters[0]?.recruiterName ?? "Recruiters balanced",
      ),
      coverageRisk: riskSummary(
        "coverage-risk",
        "Coverage Risk",
        coverageGaps,
        ctx.coverage.dmAlerts.highRiskProjects[0]?.projectName ?? "Coverage stable",
      ),
    },
    actionBoard: actionCenter.actionBoard,
    projectWarRoom,
    territoryWarRoom,
    recruiterWarRoom,
    projectForecasts,
  };
}
