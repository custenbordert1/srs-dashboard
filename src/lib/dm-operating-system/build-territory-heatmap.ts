import { normalizeStateCode } from "@/lib/dm-territory-map";
import { filterRiskRowsForDmScope } from "@/lib/dm-operating-system/filter-territory-scope";
import type {
  DmHeatMapFilters,
  DmHeatMapHealthStatus,
  DmHeatMapStoreRow,
  DmOperatingSystemScope,
} from "@/lib/dm-operating-system/types";
import type { PredictiveRiskLevel, PredictiveTerritoryRiskRow } from "@/lib/predictive-territory-risk/types";

function healthFromRow(row: PredictiveTerritoryRiskRow): DmHeatMapHealthStatus {
  if (row.pipelineDepth === 0 && row.openCalls > 0) return "zero-pipeline";
  if (row.riskLevel === "critical") return "critical";
  if (row.riskLevel === "high" || row.riskLevel === "moderate") return "at-risk";
  return "healthy";
}

function parseStoreLabel(label: string): { storeName: string; projectName: string } {
  const parts = label.split("·").map((part) => part.trim());
  if (parts.length >= 2) {
    return { storeName: parts[0]!, projectName: parts.slice(1).join(" · ") };
  }
  return { storeName: label, projectName: "—" };
}

function mapRowToHeatMapStore(
  row: PredictiveTerritoryRiskRow,
  recruiter: string,
): DmHeatMapStoreRow {
  const { storeName, projectName } = parseStoreLabel(row.label);
  const state = row.states[0] ?? "—";
  return {
    id: row.entityId,
    storeName,
    projectName,
    state,
    recruiter,
    healthStatus: healthFromRow(row),
    riskLevel: row.riskLevel,
    coveragePercent: row.coveragePercent,
    openCalls: row.openCalls,
    pipelineDepth: row.pipelineDepth,
  };
}

function buildFilterOptions(stores: DmHeatMapStoreRow[]): DmHeatMapFilters {
  const projects = [...new Set(stores.map((row) => row.projectName))].sort();
  const recruiters = [...new Set(stores.map((row) => row.recruiter))].sort();
  const states = [...new Set(stores.map((row) => row.state))].sort();
  const riskLevels = [...new Set(stores.map((row) => row.riskLevel))] as PredictiveRiskLevel[];
  return { projects, recruiters, states, riskLevels };
}

export function filterHeatMapStores(
  stores: DmHeatMapStoreRow[],
  filters: {
    project?: string;
    recruiter?: string;
    state?: string;
    riskLevel?: PredictiveRiskLevel;
  },
): DmHeatMapStoreRow[] {
  return stores.filter((row) => {
    if (filters.project && row.projectName !== filters.project) return false;
    if (filters.recruiter && row.recruiter !== filters.recruiter) return false;
    if (filters.state && normalizeStateCode(row.state) !== normalizeStateCode(filters.state)) {
      return false;
    }
    if (filters.riskLevel && row.riskLevel !== filters.riskLevel) return false;
    return true;
  });
}

export function buildTerritoryHeatMap(input: {
  storeClusters: PredictiveTerritoryRiskRow[];
  projects: PredictiveTerritoryRiskRow[];
  scope: DmOperatingSystemScope;
  defaultRecruiter?: string;
}): { stores: DmHeatMapStoreRow[]; filters: DmHeatMapFilters } {
  const scopedClusters = filterRiskRowsForDmScope(input.storeClusters, input.scope);
  const scopedProjects = filterRiskRowsForDmScope(input.projects, input.scope);
  const recruiter = input.defaultRecruiter ?? "Territory team";

  const stores = [
    ...scopedClusters.map((row) => mapRowToHeatMapStore(row, recruiter)),
    ...scopedProjects.map((row) => mapRowToHeatMapStore(row, recruiter)),
  ].sort((a, b) => {
    const healthRank: Record<DmHeatMapHealthStatus, number> = {
      critical: 0,
      "zero-pipeline": 1,
      "at-risk": 2,
      healthy: 3,
    };
    return (
      healthRank[a.healthStatus] - healthRank[b.healthStatus] ||
      b.openCalls - a.openCalls ||
      a.storeName.localeCompare(b.storeName)
    );
  });

  return {
    stores,
    filters: buildFilterOptions(stores),
  };
}
