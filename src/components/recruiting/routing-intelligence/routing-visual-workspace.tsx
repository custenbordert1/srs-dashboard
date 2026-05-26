"use client";

import { useState } from "react";
import type { RoutingVisualWorkspace } from "@/lib/routing-intelligence/routing-workspace";
import type { GeoVisualizationSnapshot } from "@/lib/routing-intelligence/geo-visualization";
import type { EnrichedRoutePack } from "@/lib/routing-intelligence/types";
import type { JobRoutingContext } from "@/lib/routing-intelligence/types";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type { VariantPerformanceRow } from "@/lib/recruiting-decision-intelligence/types";
import { RoutingTerritoryRouteCanvas } from "@/components/recruiting/routing-intelligence/routing-territory-route-canvas";
import { RoutingWorkspaceMetricsStrip } from "@/components/recruiting/routing-intelligence/routing-workspace-metrics-strip";
import { RoutingTerritoryStorytelling } from "@/components/recruiting/routing-intelligence/routing-territory-storytelling";
import { RoutingPackDetailDrawer } from "@/components/recruiting/routing-intelligence/routing-pack-detail-drawer";

type RoutingVisualWorkspaceProps = {
  workspace: RoutingVisualWorkspace;
  geo?: GeoVisualizationSnapshot;
  enrichedPacks: EnrichedRoutePack[];
  selectedPackId: string | null;
  onSelectPack: (routePackId: string) => void;
  escalations: RecruiterEscalationQueueItem[];
  jobContexts: Record<string, JobRoutingContext>;
  variants?: VariantPerformanceRow[];
};

export function RoutingVisualWorkspacePanel({
  workspace,
  geo,
  enrichedPacks,
  selectedPackId,
  onSelectPack,
  escalations,
  jobContexts,
  variants,
}: RoutingVisualWorkspaceProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedPack =
    enrichedPacks.find((pack) => pack.routePackId === selectedPackId) ?? enrichedPacks[0] ?? null;

  const handleSelectPack = (routePackId: string) => {
    onSelectPack(routePackId);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-dashed border-zinc-700/80 bg-zinc-950/50 px-4 py-3">
        <p className="text-xs font-medium text-zinc-300">Visual route planning workspace</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {workspace.visualFoundation.mapRender.note} Manual-only — no dispatch or auto-routing.
        </p>
      </div>

      <RoutingWorkspaceMetricsStrip metrics={workspace.metrics} />

      <RoutingTerritoryStorytelling
        indicators={workspace.storytelling}
        onSelectPack={handleSelectPack}
      />

      <RoutingTerritoryRouteCanvas
        cards={workspace.canvasCards}
        geo={geo}
        selectedPackId={selectedPackId}
        onSelectPack={handleSelectPack}
      />

      <RoutingPackDetailDrawer
        open={drawerOpen}
        pack={selectedPack}
        drawerContext={
          selectedPack ? workspace.drawerContextByPackId[selectedPack.routePackId] : undefined
        }
        escalations={escalations}
        jobContexts={jobContexts}
        variants={variants}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
