import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import type { ProjectForecastRow } from "@/lib/executive-operations-center/types";
import type { StoreCoverageRow } from "@/lib/placement-command-center/types";
import type { PredictiveRiskForecast, PredictiveTerritoryRiskRow } from "@/lib/predictive-territory-risk/types";

export function buildZeroPipelineStoreForecasts(
  storeCoverage: StoreCoverageRow[],
): PredictiveRiskForecast[] {
  return storeCoverage
    .filter((row) => row.openCalls > 0 && row.candidatesInPipeline === 0 && row.coveragePercent < 55)
    .slice(0, 15)
    .map((row) => ({
      id: `forecast:zero-pipeline:${row.opportunityId}`,
      kind: "zero-pipeline-store" as const,
      label: `${row.store} · ${row.project}`,
      dmName: row.client,
      confidence: Math.min(92, 60 + (55 - row.coveragePercent)),
      reason: `Zero pipeline with ${row.openCalls} open calls and ${row.coveragePercent}% coverage`,
      navigation: {
        tabId: "placement-command-center" as const,
        elementId: "placement-store-coverage",
        label: "Open Placement Command Center",
      },
    }));
}

export function buildTerritoryMissCompletionForecasts(
  projectForecasts: ProjectForecastRow[],
  dmByOpportunity: Map<string, string>,
): PredictiveRiskForecast[] {
  return projectForecasts
    .filter((row) => row.outcome === "likely-to-miss" || row.outcome === "at-risk")
    .slice(0, 15)
    .map((row) => ({
      id: `forecast:territory-miss:${row.opportunityId}`,
      kind: "territory-miss-completion" as const,
      label: row.projectName,
      dmName: dmByOpportunity.get(row.opportunityId) ?? "Unassigned",
      confidence: row.confidenceScore,
      reason: row.reason,
      navigation: {
        tabId: "placement-command-center" as const,
        elementId: "placement-project-forecasts",
        label: "Open Project Forecasts",
      },
    }));
}

export function buildDmCoverageMissForecasts(
  territories: PredictiveTerritoryRiskRow[],
): PredictiveRiskForecast[] {
  return territories
    .filter((row) => row.riskLevel === "critical" || row.riskLevel === "high")
    .slice(0, 15)
    .map((row) => ({
      id: `forecast:dm-coverage:${row.entityId}`,
      kind: "dm-coverage-miss" as const,
      label: row.label,
      dmName: row.dmName,
      confidence: Math.min(95, row.riskScore),
      reason: `Predicted to fall below coverage targets (${row.coveragePercent}% coverage, risk ${row.riskScore})`,
      navigation: {
        tabId: "dm-scorecards" as const,
        label: "Open DM Scorecards",
      },
    }));
}

export function countAlertsByDm(alerts: ExecutiveAlert[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const alert of alerts) {
    const dm =
      alert.context?.dmName ?? alert.context?.territoryLabel ?? alert.context?.state ?? "Unassigned";
    counts.set(dm, (counts.get(dm) ?? 0) + 1);
  }
  return counts;
}

export function countFollowUpsByDm(
  followUps: ExecutiveAlertFollowUp[],
  alerts: ExecutiveAlert[],
  referenceMs = Date.now(),
): { total: Map<string, number>; overdue: Map<string, number> } {
  const alertDm = new Map(
    alerts.map((alert) => [
      alert.id,
      alert.context?.dmName ?? alert.context?.territoryLabel ?? "Unassigned",
    ]),
  );
  const total = new Map<string, number>();
  const overdue = new Map<string, number>();

  for (const followUp of followUps) {
    const dm =
      followUp.ownerKind === "dm"
        ? followUp.ownerName
        : alertDm.get(followUp.alertId) ?? "Unassigned";
    total.set(dm, (total.get(dm) ?? 0) + 1);
    const due = Date.parse(followUp.dueDate);
    if (!Number.isNaN(due) && due < referenceMs) {
      overdue.set(dm, (overdue.get(dm) ?? 0) + 1);
    }
  }

  return { total, overdue };
}
