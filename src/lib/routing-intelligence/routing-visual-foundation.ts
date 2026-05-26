/**
 * Future-ready routing visualization contracts — placeholders only.
 * No map providers, exports, or assignment engines are wired in this phase.
 */

export type GeoCoordinate = {
  latitude: number;
  longitude: number;
};

export type TerritoryPolygonPlaceholder = {
  polygonId: string;
  label: string;
  /** Closed ring of lat/lng vertices for future map overlay. */
  vertices: GeoCoordinate[];
  state: string;
};

export type RouteLinePlaceholder = {
  lineId: string;
  fromNodeId: string;
  toNodeId: string;
  estimatedMiles: number;
  strokeTier: 1 | 2 | 3 | 4;
};

export type MapRenderProviderPlaceholder = {
  provider: "google-maps" | "mapbox" | "internal-canvas";
  enabled: false;
  note: string;
};

export type RouteExportPacketPlaceholder = {
  exportId: string;
  routePackId: string;
  format: "pdf" | "csv" | "geojson";
  status: "not-implemented";
};

export type HotelEstimationPlaceholder = {
  routePackId: string;
  nightsRecommended: number;
  estimatedCostUsd: number | null;
  status: "not-implemented";
};

export type RepAssignmentEnginePlaceholder = {
  routePackId: string;
  suggestedRepIds: string[];
  status: "manual-only-not-implemented";
};

export type RoutingVisualFoundation = {
  mapRender: MapRenderProviderPlaceholder;
  routeLines: RouteLinePlaceholder[];
  territoryPolygons: TerritoryPolygonPlaceholder[];
  routeExports: RouteExportPacketPlaceholder[];
  hotelEstimates: HotelEstimationPlaceholder[];
  repAssignmentEngine: RepAssignmentEnginePlaceholder[];
};

export function emptyRoutingVisualFoundation(): RoutingVisualFoundation {
  return {
    mapRender: {
      provider: "internal-canvas",
      enabled: false,
      note: "Live map rendering reserved for a future phase — use territory canvas cards today.",
    },
    routeLines: [],
    territoryPolygons: [],
    routeExports: [],
    hotelEstimates: [],
    repAssignmentEngine: [],
  };
}
