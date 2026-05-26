import type { DmAlertPriority } from "@/lib/dm-dashboard/dm-alert-priority";

/** Distance tier for nearest active rep coverage. */
export type TravelTier = 1 | 2 | 3 | 4;

export type RouteRiskLevel = "healthy" | "staffing_pressure" | "operational_risk";

export type RoutingStoreRef = {
  opportunityId: string;
  storeName: string;
  projectName: string;
  city: string;
  state: string;
};

export type StoreCluster = {
  clusterId: string;
  label: string;
  city: string;
  state: string;
  storeCount: number;
  openStoreCalls: number;
  clusterRadiusMiles: number;
  stores: RoutingStoreRef[];
};

/** Future-ready route pack — models only, no dispatch automation. */
export type RoutePack = {
  routePackId: string;
  clusterId: string;
  label: string;
  cities: string[];
  state: string;
  storeCount: number;
  clusterRadiusMiles: number;
  estimatedMiles: number;
  estimatedDriveTimeMinutes: number;
  estimatedStoreHours: number;
  overnightRequired: boolean;
  suggestedRepCount: number;
  staffingRisk: RouteRiskLevel;
  nearbyMetroSupport: string[];
  groupingRecommendation: string;
  nearestActiveRepMiles: number | null;
  travelTier: TravelTier;
  manualOnly: true;
};

export type NearbyRepRoutingRow = {
  repId: string;
  repName: string;
  distanceMiles: number | null;
  active: boolean;
  travelRadiusMiles: number;
};

export type JobRoutingContext = {
  jobId: string;
  nearbyRepCount: number;
  nearestRepMiles: number | null;
  travelTier: TravelTier;
  travelTierLabel: string;
  nearbyOpenStores: number;
  clusteredOpportunities: number;
  estimatedRouteDifficulty: number;
  overnightRisk: boolean;
  driveBurdenScore: number;
  routeGroupingRecommendations: string[];
  nearbyReps: NearbyRepRoutingRow[];
  storeCluster: StoreCluster | null;
  relatedRoutePackIds: string[];
  riskLevel: RouteRiskLevel;
  manualOnly: true;
};

export type RouteIntelligenceCardRow = {
  id: string;
  title: string;
  subtitle: string;
  severity: DmAlertPriority;
  riskLevel: RouteRiskLevel;
  travelTier?: TravelTier;
  jobId?: string;
  routePackId?: string;
  manualOnly: true;
};

export type RouteBurdenMetrics = {
  estimatedDriveBurden: number;
  estimatedOvernightLikelihood: number;
  multiDayRouteProbability: number;
  coverageSaturation: number;
  routeEfficiencyScore: number;
};

export type EnrichedRoutePack = RoutePack & {
  geoClusterId: string;
  routePackScore: number;
  burden: RouteBurdenMetrics;
  groupedStores: RoutingStoreRef[];
  nearbyReps: NearbyRepRoutingRow[];
};

/** Client render phases — all fields may be present; phase signals what UI should mount. */
export type RoutingLoadPhase = "core" | "operational" | "detail";

export type RoutingIntelligenceLoadState = {
  phase: RoutingLoadPhase;
  cacheHit: boolean;
  syncing: boolean;
  buildMs?: number;
};

export type RoutingIntelligenceSnapshot = {
  fetchedAt: string;
  manualOnly: true;
  jobContexts: Record<string, JobRoutingContext>;
  routePacks: RoutePack[];
  routeRiskQueue: RouteIntelligenceCardRow[];
  uncoveredTerritories: RouteIntelligenceCardRow[];
  overnightRisk: RouteIntelligenceCardRow[];
  clusterOpportunities: RouteIntelligenceCardRow[];
  multiStoreRoutePacks: RouteIntelligenceCardRow[];
  nearbyRepCoverage: RouteIntelligenceCardRow[];
  highTravelBurdenJobs: RouteIntelligenceCardRow[];
  territoryOverview?: import("@/lib/routing-intelligence/territory-overview").TerritoryOverviewCard[];
  routeQueues?: import("@/lib/routing-intelligence/route-queue").RouteQueueRow[];
  enrichedRoutePacks?: EnrichedRoutePack[];
  geoVisualization?: import("@/lib/routing-intelligence/geo-visualization").GeoVisualizationSnapshot;
  visualWorkspace?: import("@/lib/routing-intelligence/routing-workspace").RoutingVisualWorkspace;
  loadState?: RoutingIntelligenceLoadState;
};
