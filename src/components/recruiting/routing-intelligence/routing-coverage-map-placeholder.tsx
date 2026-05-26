"use client";

import type { GeoRouteNode, GeoVisualizationSnapshot } from "@/lib/routing-intelligence/geo-visualization";
import { ROUTE_RISK_STYLES } from "@/lib/routing-intelligence";
import { metroLabelForCity } from "@/lib/routing-intelligence/geo-visualization";

type RoutingCoverageMapPlaceholderProps = {
  geo?: GeoVisualizationSnapshot;
  clusters: GeoRouteNode[];
};

export function RoutingCoverageMapPlaceholder({ geo, clusters }: RoutingCoverageMapPlaceholderProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <header className="mb-3">
        <h3 className="text-base font-semibold text-zinc-50">Territory coverage map</h3>
        <p className="mt-1 text-xs text-zinc-500">{geo?.mapPhaseNote ?? "Map visualization coming next phase."}</p>
      </header>

      <div className="rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 px-4 py-8 text-center">
        <p className="text-sm font-medium text-violet-200">Map visualization coming next phase</p>
        <p className="mt-1 text-xs text-zinc-500">
          Geo nodes and connection lines are pre-built for Mapbox / Google Maps integration later.
        </p>
        <p className="mt-2 text-[10px] text-zinc-600">
          {geo?.connections.length ?? 0} connection lines · {geo?.metroGroups.length ?? 0} metro groups
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clusters.slice(0, 9).map((node) => (
          <div
            key={node.nodeId}
            className={`rounded-xl border px-3 py-2 text-xs ${ROUTE_RISK_STYLES.healthy}`}
          >
            <p className="font-semibold text-zinc-100">
              {node.city}, {node.state}
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">
              {node.storeCount} stores · placeholder {node.latitude.toFixed(2)}, {node.longitude.toFixed(2)}
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">
              Metro: {metroLabelForCity(node.city, node.state)}
            </p>
            {geo?.connections
              .filter((line) => line.fromNodeId === node.nodeId || line.toNodeId === node.nodeId)
              .slice(0, 2)
              .map((line) => (
                <p key={line.connectionId} className="mt-1 text-[10px] text-violet-300/80">
                  ↔ {line.estimatedMiles} mi link
                </p>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
