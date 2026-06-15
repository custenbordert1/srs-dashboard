import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type {
  ExecutivePlacementBoardRow,
  PlacementCoverageRisk,
  ProjectFillForecastRow,
  StoreCoverageRow,
} from "@/lib/placement-command-center/types";

function severityLabel(risk: PlacementCoverageRisk): string {
  if (risk === "red") return "Critical";
  if (risk === "yellow") return "At risk";
  return "Stable";
}

export function buildExecutivePlacementBoard(input: {
  storeCoverage: StoreCoverageRow[];
  projectForecasts: ProjectFillForecastRow[];
  opportunities: MelOpportunity[];
  coverage: CoverageRiskSnapshot | null;
}): ExecutivePlacementBoardRow[] {
  const rows: ExecutivePlacementBoardRow[] = [];

  for (const project of input.projectForecasts.filter((row) => row.outcome === "critical").slice(0, 8)) {
    rows.push({
      id: `project:${project.opportunityId}`,
      category: "project",
      label: project.projectName,
      detail: project.reason,
      metric: `${project.currentFillRatePercent}% fill · need ${project.requiredFillRatePercent}%`,
      severity: "red",
    });
  }

  const stateRisk = new Map<string, { open: number; coverage: number }>();
  for (const row of input.storeCoverage) {
    const opportunity = input.opportunities.find((item) => item.opportunityId === row.opportunityId);
    const state = normalizeStateCode(opportunity?.state ?? "");
    if (!state) continue;
    const current = stateRisk.get(state) ?? { open: 0, coverage: 0 };
    current.open += row.openCalls;
    current.coverage += row.coveragePercent;
    stateRisk.set(state, current);
  }

  [...stateRisk.entries()]
    .map(([state, metrics]) => ({
      state,
      open: metrics.open,
      avgCoverage: metrics.open > 0 ? Math.round(metrics.coverage / metrics.open) : 100,
    }))
    .sort((a, b) => a.avgCoverage - b.avgCoverage)
    .slice(0, 6)
    .forEach((row) => {
      rows.push({
        id: `state:${row.state}`,
        category: "state",
        label: row.state,
        detail: `${row.open} open calls with weak coverage`,
        metric: `${row.avgCoverage}% avg coverage`,
        severity: row.avgCoverage < 45 ? "red" : row.avgCoverage < 65 ? "yellow" : "green",
      });
    });

  for (const gap of input.storeCoverage.filter((row) => row.risk === "red").slice(0, 6)) {
    rows.push({
      id: `gap:${gap.opportunityId}`,
      category: "coverage-gap",
      label: `${gap.store} · ${gap.client}`,
      detail: `${gap.candidatesInPipeline} in pipeline · ${gap.candidatesAssigned} assigned`,
      metric: `${gap.coveragePercent}% coverage`,
      severity: gap.risk,
    });
  }

  const improving = input.coverage?.executiveSummary
    ? input.projectForecasts
        .filter((row) => row.outcome === "likely-to-fill")
        .slice(0, 5)
        .map((row) => ({
          id: `improving:${row.opportunityId}`,
          category: "improving-territory" as const,
          label: row.projectName,
          detail: row.reason,
          metric: `${severityLabel("green")} · ${row.confidenceScore}% confidence`,
          severity: "green" as PlacementCoverageRisk,
        }))
    : [];

  return [...rows, ...improving].slice(0, 24);
}
