import { expandMetroCities } from "@/lib/job-management/job-metro-expansion";
import { estimateGeoPoint, haversineMiles } from "@/lib/mel-matching/distance-utils";
import type { RoutePack, StoreCluster } from "@/lib/routing-intelligence/types";
import { travelTierFromNearestRepMiles } from "@/lib/routing-intelligence/travel-tier";

export type GeoRouteNode = {
  nodeId: string;
  geoClusterId: string;
  city: string;
  state: string;
  /** Placeholder coordinates for future map phase — derived from city centroids. */
  latitude: number;
  longitude: number;
  storeCount: number;
  travelTier: ReturnType<typeof travelTierFromNearestRepMiles>;
};

export type GeoConnectionLine = {
  connectionId: string;
  fromNodeId: string;
  toNodeId: string;
  estimatedMiles: number;
  metroGroupRef: string;
};

export type MetroGroupRef = {
  metroGroupRef: string;
  label: string;
  state: string;
  cities: string[];
  nodeIds: string[];
};

export type GeoVisualizationSnapshot = {
  geoClusterId: string;
  nodes: GeoRouteNode[];
  connections: GeoConnectionLine[];
  metroGroups: MetroGroupRef[];
  mapPhaseNote: string;
};

export function buildGeoVisualization(
  clusters: StoreCluster[],
  routePacks: RoutePack[],
): GeoVisualizationSnapshot {
  const nodes: GeoRouteNode[] = clusters.map((cluster) => {
    const point = estimateGeoPoint(cluster.city, cluster.state);
    return {
      nodeId: `node:${cluster.clusterId}`,
      geoClusterId: cluster.clusterId,
      city: cluster.city,
      state: cluster.state,
      latitude: point?.lat ?? 0,
      longitude: point?.lng ?? 0,
      storeCount: cluster.storeCount,
      travelTier: 3,
    };
  });

  const connections: GeoConnectionLine[] = [];
  for (const pack of routePacks) {
    const packNodes = nodes.filter((node) =>
      pack.cities.some((city) => city.toLowerCase() === node.city.toLowerCase() && node.state === pack.state),
    );
    for (let i = 0; i < packNodes.length - 1; i += 1) {
      const from = packNodes[i]!;
      const to = packNodes[i + 1]!;
      const miles = haversineMiles(
        { lat: from.latitude, lng: from.longitude },
        { lat: to.latitude, lng: to.longitude },
      );
      connections.push({
        connectionId: `conn:${pack.routePackId}:${from.nodeId}:${to.nodeId}`,
        fromNodeId: from.nodeId,
        toNodeId: to.nodeId,
        estimatedMiles: Math.round(miles),
        metroGroupRef: pack.routePackId,
      });
    }
  }

  const metroGroups: MetroGroupRef[] = routePacks.map((pack) => ({
    metroGroupRef: pack.routePackId,
    label: pack.label,
    state: pack.state,
    cities: pack.cities,
    nodeIds: nodes
      .filter((node) =>
        pack.cities.some((c) => c.toLowerCase() === node.city.toLowerCase() && node.state === pack.state),
      )
      .map((node) => node.nodeId),
  }));

  const anchor = clusters[0];
  const geoClusterId = anchor ? `geo:${anchor.state}:overview` : "geo:empty";

  return {
    geoClusterId,
    nodes,
    connections,
    metroGroups,
    mapPhaseNote: "Map visualization coming next phase — cluster cards use placeholder lat/lng from city centroids.",
  };
}

export function metroLabelForCity(city: string, state: string): string {
  return expandMetroCities(city, state, 4).join(" · ");
}
