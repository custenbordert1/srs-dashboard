import type {
  AlertImpactInputs,
  AlertSeverity,
  AlertSnapshot,
  ExecutiveAlert,
} from "@/lib/alerts/alert-types";

const SEVERITY_WEIGHT: Record<AlertSeverity, number> = {
  critical: 40,
  high: 28,
  medium: 16,
  low: 8,
};

export function computeImpactScore(input: AlertImpactInputs): number {
  const base = SEVERITY_WEIGHT[input.severity];
  const business = Math.min(30, input.businessImpact ?? 0);
  const openCalls = Math.min(15, Math.min(15, (input.openCalls ?? 0) * 2));
  const coverage = Math.min(20, input.coverageRisk ?? 0);
  const forecast = Math.min(10, input.forecastGap ?? 0);
  return Math.round(Math.min(100, base + business + openCalls + coverage + forecast));
}

export function sortAlertsByImpact(alerts: ExecutiveAlert[]): ExecutiveAlert[] {
  return [...alerts].sort((a, b) => {
    if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
    return a.title.localeCompare(b.title);
  });
}

export function buildPrioritizedAlertSnapshot(
  alerts: ExecutiveAlert[],
  generatedAt: string,
  metaExtras?: Partial<AlertSnapshot["meta"]>,
): AlertSnapshot {
  const sorted = sortAlertsByImpact(alerts);
  const criticalAlerts = sorted.filter((row) => row.severity === "critical");
  const highAlerts = sorted.filter((row) => row.severity === "high");
  const mediumAlerts = sorted.filter((row) => row.severity === "medium");
  const lowAlerts = sorted.filter((row) => row.severity === "low");

  const byCategory: AlertSnapshot["meta"]["byCategory"] = {
    project: 0,
    territory: 0,
    recruiter: 0,
    placement: 0,
    candidate: 0,
    coverage: 0,
  };
  const bySeverity: AlertSnapshot["meta"]["bySeverity"] = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const alert of sorted) {
    byCategory[alert.category] += 1;
    bySeverity[alert.severity] += 1;
  }

  return {
    generatedAt,
    alerts: sorted,
    criticalAlerts,
    highAlerts,
    mediumAlerts,
    lowAlerts,
    topCritical: criticalAlerts.slice(0, 10),
    topActions: sorted.slice(0, 25),
    meta: {
      totalCount: sorted.length,
      byCategory,
      bySeverity,
      ...metaExtras,
    },
  };
}
