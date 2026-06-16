import type {
  DmCapacityRow,
  RecruiterCapacityRow,
  StaffingRiskArea,
  StaffingRiskKind,
} from "@/lib/workforce-capacity-forecast/types";
import type { CoverageForecastRow } from "@/lib/workforce-capacity-forecast/types";
import type { PredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk/types";

function severityFromScore(score: number): StaffingRiskArea["severity"] {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  return "moderate";
}

function pushRisk(
  risks: StaffingRiskArea[],
  input: Omit<StaffingRiskArea, "severity"> & { severity?: StaffingRiskArea["severity"] },
): void {
  risks.push({
    ...input,
    severity: input.severity ?? severityFromScore(input.riskScore),
  });
}

export function buildStaffingRiskAreas(input: {
  recruiterCapacity: RecruiterCapacityRow[];
  dmCapacity: DmCapacityRow[];
  coverageForecasts: CoverageForecastRow[];
  riskSnapshot: PredictiveTerritoryRiskSnapshot;
}): StaffingRiskArea[] {
  const risks: StaffingRiskArea[] = [];

  for (const recruiter of input.recruiterCapacity) {
    if (recruiter.state === "overloaded" || recruiter.needsHelp) {
      pushRisk(risks, {
        id: `risk:recruiter:${recruiter.recruiterName}`,
        kind: "recruiter-overload",
        label: recruiter.recruiterName,
        recruiterName: recruiter.recruiterName,
        riskScore: recruiter.capacityPercent,
        reason: `${recruiter.followUpVolume} follow-ups and ${recruiter.openCallLoad} open calls at ${recruiter.capacityPercent}% capacity`,
      });
    }
  }

  for (const dm of input.dmCapacity) {
    if (dm.atRisk) {
      pushRisk(risks, {
        id: `risk:dm:${dm.dmName}`,
        kind: "dm-overload",
        label: dm.dmName,
        dmName: dm.dmName,
        riskScore: 100 - dm.capacityScore,
        reason: `Capacity score ${dm.capacityScore} with ${dm.openCalls} open calls and ${dm.followUpBacklog} overdue follow-ups`,
      });
    }
  }

  for (const forecast of input.coverageForecasts) {
    const thirtyDay = forecast.forecasts.find((row) => row.horizon === "30d");
    if (!thirtyDay) continue;
    if (thirtyDay.coveragePercent < 55 && forecast.currentOpenCalls > 0) {
      pushRisk(risks, {
        id: `risk:coverage:${forecast.entityId}`,
        kind: "coverage-shortage",
        label: forecast.label,
        dmName: forecast.dmName,
        riskScore: Math.round(100 - thirtyDay.coveragePercent),
        reason: `Projected ${thirtyDay.coveragePercent}% coverage with ${forecast.currentOpenCalls} open calls`,
      });
    }
  }

  for (const project of input.riskSnapshot.projects.filter(
    (row) => row.riskLevel === "critical" || row.riskLevel === "high",
  ).slice(0, 8)) {
    pushRisk(risks, {
      id: `risk:completion:${project.entityId}`,
      kind: "completion-risk",
      label: project.label,
      dmName: project.dmName,
      riskScore: project.riskScore,
      reason: `Completion risk ${project.riskLevel} with ${project.openCalls} open calls`,
    });
  }

  return risks.sort((a, b) => b.riskScore - a.riskScore);
}

export function topStaffingRisks(risks: StaffingRiskArea[], limit = 10): StaffingRiskArea[] {
  return risks.slice(0, limit);
}

export function risksByKind(
  risks: StaffingRiskArea[],
  kind: StaffingRiskKind,
): StaffingRiskArea[] {
  return risks.filter((risk) => risk.kind === kind);
}
