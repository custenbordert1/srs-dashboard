import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { TerritoryOverviewCard } from "@/lib/routing-intelligence/territory-overview";
import type { RouteWorkspaceMetrics } from "@/lib/routing-intelligence/routing-workspace";
import type { RoutingIntelligenceLoadState } from "@/lib/routing-intelligence/types";

/** Max MEL opportunities allowed for full route-pack clustering per request. */
export const ROUTING_PACK_ROW_LIMIT = 2_500;

export const ROUTING_SCOPE_REQUIRED_MESSAGE =
  "Select a DM, state, or project to build route packs.";

export const ROUTING_SCOPE_OVER_LIMIT_MESSAGE = (count: number, limit: number) =>
  `${count.toLocaleString()} stores match this scope (limit ${limit.toLocaleString()}). Narrow by DM, state, or project.`;

export type RoutingScopeStatusFilter = "all" | "open" | "staffed";

export type RoutingScopeFilters = {
  dm?: string;
  state?: string;
  project?: string;
  status?: RoutingScopeStatusFilter;
};

export type RoutingFilterOptions = {
  dms: string[];
  states: string[];
  projects: string[];
  statuses: RoutingScopeStatusFilter[];
};

export type RoutingIntelligenceSummary = {
  fetchedAt: string;
  manualOnly: true;
  territoryLabel: string;
  melRowCount: number;
  territoryRowCount: number;
  scopedRowCount: number;
  requiresScopeForPacks: true;
  scopeApplied: boolean;
  overPackLimit: boolean;
  packRowLimit: number;
  metrics: RouteWorkspaceMetrics;
  territoryOverview: TerritoryOverviewCard[];
  filterOptions: RoutingFilterOptions;
  loadState: RoutingIntelligenceLoadState;
};

export function hasRoutingScopeFilter(scope: RoutingScopeFilters): boolean {
  if (scope.dm?.trim()) return true;
  if (scope.state?.trim()) return true;
  if (scope.project?.trim()) return true;
  if (scope.status && scope.status !== "all") return true;
  return false;
}

export function parseRoutingScopeFilters(searchParams: URLSearchParams): RoutingScopeFilters {
  const statusRaw = searchParams.get("status")?.trim().toLowerCase();
  const status: RoutingScopeStatusFilter | undefined =
    statusRaw === "open" || statusRaw === "staffed" || statusRaw === "all" ? statusRaw : undefined;
  return {
    dm: searchParams.get("dm")?.trim() || undefined,
    state: searchParams.get("state")?.trim() || undefined,
    project: searchParams.get("project")?.trim() || undefined,
    status,
  };
}

export function buildRoutingFilterOptions(opportunities: MelOpportunity[]): RoutingFilterOptions {
  const dms = new Set<string>();
  const states = new Set<string>();
  const projects = new Set<string>();
  for (const row of opportunities) {
    if (row.territoryOwner.trim()) dms.add(row.territoryOwner.trim());
    if (row.state) states.add(normalizeStateCode(row.state));
    const projectKey = row.projectName.trim() || row.projectNo.trim();
    if (projectKey) projects.add(projectKey);
  }
  const sortAlpha = (a: string, b: string) => a.localeCompare(b);
  return {
    dms: [...dms].sort(sortAlpha).slice(0, 120),
    states: [...states].sort(sortAlpha),
    projects: [...projects].sort(sortAlpha).slice(0, 200),
    statuses: ["all", "open", "staffed"],
  };
}

export function filterOpportunitiesByRoutingScope(
  opportunities: MelOpportunity[],
  scope: RoutingScopeFilters,
): MelOpportunity[] {
  const dm = scope.dm?.trim().toLowerCase();
  const state = scope.state?.trim() ? normalizeStateCode(scope.state) : undefined;
  const project = scope.project?.trim().toLowerCase();
  const status = scope.status ?? "all";

  return opportunities.filter((row) => {
    if (dm && row.territoryOwner.trim().toLowerCase() !== dm) return false;
    if (state && normalizeStateCode(row.state) !== state) return false;
    if (project) {
      const haystack = `${row.projectName} ${row.projectNo}`.toLowerCase();
      if (!haystack.includes(project)) return false;
    }
    if (status === "open" && (!row.openStatus || row.isStaffed)) return false;
    if (status === "staffed" && !row.isStaffed) return false;
    return true;
  });
}

type StateAggregate = {
  state: string;
  openStores: number;
  cities: Set<string>;
  dms: Set<string>;
};

function buildSummaryTerritoryOverview(aggregates: StateAggregate[]): TerritoryOverviewCard[] {
  const sorted = [...aggregates].sort((a, b) => b.openStores - a.openStores);
  const largest = sorted[0];
  const second = sorted[1];

  function card(
    id: TerritoryOverviewCard["id"],
    title: string,
    headline: string,
    detail: string,
    severity: TerritoryOverviewCard["severity"],
  ): TerritoryOverviewCard {
    return { id, title, headline, detail, severity, manualOnly: true };
  }

  return [
    card(
      "largest-store-cluster",
      "Largest state footprint",
      largest ? `${largest.state} · ${largest.openStores} open stores` : "—",
      largest ? `${largest.cities.size} cities · ${largest.dms.size} DMs` : "No open stores in scope",
      "high",
    ),
    card(
      "largest-uncovered",
      "Second-largest state",
      second ? `${second.state} · ${second.openStores} stores` : "—",
      second ? "Apply a scope filter to build route packs" : "Single-state territory",
      "medium",
    ),
    card(
      "highest-travel-burden",
      "Open store volume",
      `${sorted.reduce((sum, row) => sum + row.openStores, 0)} stores`,
      `Across ${sorted.length} state${sorted.length === 1 ? "" : "s"} in recruiter territory`,
      "medium",
    ),
    card(
      "best-route-pack",
      "Route packs",
      "Not built yet",
      ROUTING_SCOPE_REQUIRED_MESSAGE,
      "low",
    ),
    card(
      "highest-overnight",
      "Scope required",
      "Summary only",
      "Select DM, state, or project then build route packs",
      "low",
    ),
    card(
      "strongest-rep-market",
      "MEL sync",
      "Territory-scoped",
      "National routing is not computed on initial load",
      "low",
    ),
  ];
}

export function buildRoutingIntelligenceSummary(input: {
  fetchedAt: string;
  territoryLabel: string;
  melRowCount: number;
  territoryOpportunities: MelOpportunity[];
  scope: RoutingScopeFilters;
}): RoutingIntelligenceSummary {
  const scoped = filterOpportunitiesByRoutingScope(input.territoryOpportunities, input.scope);
  const scopeApplied = hasRoutingScopeFilter(input.scope);
  const overPackLimit = scopeApplied && scoped.length > ROUTING_PACK_ROW_LIMIT;

  const aggregates = new Map<string, StateAggregate>();
  for (const row of input.territoryOpportunities) {
    if (!row.openStatus) continue;
    const state = normalizeStateCode(row.state);
    const bucket = aggregates.get(state) ?? {
      state,
      openStores: 0,
      cities: new Set<string>(),
      dms: new Set<string>(),
    };
    bucket.openStores += 1;
    bucket.cities.add(row.city.toLowerCase());
    if (row.territoryOwner.trim()) bucket.dms.add(row.territoryOwner.trim());
    aggregates.set(state, bucket);
  }

  const stateRows = [...aggregates.values()];
  const totalOpen = stateRows.reduce((sum, row) => sum + row.openStores, 0);
  const stateCount = stateRows.length;

  const metrics: RouteWorkspaceMetrics = {
    totalEstimatedRouteMiles: 0,
    avgDriveBurden: 0,
    overnightPercent: 0,
    multiDayPercent: 0,
    routeEfficiencyScore: 0,
    coverageSaturation: Math.min(
      100,
      Math.round((totalOpen / Math.max(1, input.territoryOpportunities.length)) * 100),
    ),
    avgStoresPerRoutePack: 0,
    avgOpenJobsPerRoutePack: 0,
    routePackCount: 0,
    manualOnly: true,
  };

  return {
    fetchedAt: input.fetchedAt,
    manualOnly: true,
    territoryLabel: input.territoryLabel,
    melRowCount: input.melRowCount,
    territoryRowCount: input.territoryOpportunities.length,
    scopedRowCount: scoped.length,
    requiresScopeForPacks: true,
    scopeApplied,
    overPackLimit,
    packRowLimit: ROUTING_PACK_ROW_LIMIT,
    metrics,
    territoryOverview: buildSummaryTerritoryOverview(stateRows),
    filterOptions: buildRoutingFilterOptions(input.territoryOpportunities),
    loadState: {
      phase: "core",
      cacheHit: false,
      syncing: false,
    },
  };
}
