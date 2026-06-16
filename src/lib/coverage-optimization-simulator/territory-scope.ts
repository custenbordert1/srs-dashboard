import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { PredictiveTerritoryRiskRow } from "@/lib/predictive-territory-risk/types";
import type {
  CoverageOptimizationSimulatorScope,
  TerritorySimulatorOption,
} from "@/lib/coverage-optimization-simulator/types";

export function isTerritoryInSimulatorScope(
  states: string[],
  scope: CoverageOptimizationSimulatorScope,
): boolean {
  if (!scope.scopedToTerritory || scope.territoryStates.length === 0) return true;
  const allowed = new Set(scope.territoryStates.map((state) => normalizeStateCode(state)));
  return states.some((state) => allowed.has(normalizeStateCode(state)));
}

export function filterTerritoryRowsForScope(
  rows: PredictiveTerritoryRiskRow[],
  scope: CoverageOptimizationSimulatorScope,
): PredictiveTerritoryRiskRow[] {
  return rows.filter((row) => isTerritoryInSimulatorScope(row.states, scope));
}

export function buildTerritorySimulatorOptions(
  rows: PredictiveTerritoryRiskRow[],
  scope: CoverageOptimizationSimulatorScope,
): TerritorySimulatorOption[] {
  return filterTerritoryRowsForScope(rows, scope)
    .map((row) => ({
      entityId: row.entityId,
      entityType: row.entityType,
      label: row.label,
      dmName: row.dmName,
      states: row.states,
      currentCoveragePercent: row.coveragePercent,
      openCalls: row.openCalls,
      riskScore: row.riskScore,
    }))
    .sort((a, b) => b.riskScore - a.riskScore);
}

export function territoryScaleForRow(row: PredictiveTerritoryRiskRow | undefined): number {
  if (!row) return 1;
  if (row.riskLevel === "critical") return 1.25;
  if (row.riskLevel === "high") return 1.1;
  if (row.riskLevel === "moderate") return 0.95;
  return 0.75;
}

export function findTerritoryRow(
  rows: PredictiveTerritoryRiskRow[],
  entityId: string | null | undefined,
): PredictiveTerritoryRiskRow | undefined {
  if (!entityId) return undefined;
  return rows.find((row) => row.entityId === entityId);
}
