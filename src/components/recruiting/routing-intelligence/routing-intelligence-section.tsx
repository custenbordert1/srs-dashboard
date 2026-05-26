"use client";

import { useMemo, useState } from "react";
import { useRecruitingIntelligence } from "@/hooks/use-recruiting-intelligence";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { AutomationSyncStatusBanner } from "@/components/recruiting/automation-sync-status-banner";
import { RoutingTerritoryOverview } from "@/components/recruiting/routing-intelligence/routing-territory-overview";
import { RoutingRouteQueue } from "@/components/recruiting/routing-intelligence/routing-route-queue";
import { RoutingPackBuilder } from "@/components/recruiting/routing-intelligence/routing-pack-builder";
import { RoutingCoverageMapPlaceholder } from "@/components/recruiting/routing-intelligence/routing-coverage-map-placeholder";
import { RoutingTravelBurdenPanel } from "@/components/recruiting/routing-intelligence/routing-travel-burden-panel";
import { RoutingVisualWorkspacePanel } from "@/components/recruiting/routing-intelligence/routing-visual-workspace";
import type { EnrichedRoutePack } from "@/lib/routing-intelligence/types";

export function RoutingIntelligenceSection() {
  const {
    data,
    meta,
    error,
    fatalError,
    loading,
    refreshing,
    timedOut,
    stale,
    lastSyncedAt,
    refresh,
  } = useRecruitingIntelligence();
  const loadingCeilingHit = useLoadingCeiling(loading && !data);
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const routing = data?.routingIntelligence;
  const selectedPack = useMemo(() => {
    const packs = routing?.enrichedRoutePacks ?? [];
    if (!selectedPackId) return packs[0] ?? null;
    return packs.find((pack) => pack.routePackId === selectedPackId) ?? packs[0] ?? null;
  }, [routing?.enrichedRoutePacks, selectedPackId]);

  if (loading && !data) {
    return (
      <DashboardSectionFallback
        title="Routing Intelligence"
        loadingMessage="Loading territory routing and staffing logistics…"
        isLoading
        loadingCeilingHit={loadingCeilingHit}
        timedOut={timedOut}
        onRetry={refresh}
        retrying={refreshing}
        skeletonRows={4}
        skeletonCards={3}
      />
    );
  }

  if (!data && fatalError) {
    return (
      <DashboardSectionFallback
        title="Routing Intelligence"
        error={fatalError}
        timedOut={timedOut}
        onRetry={refresh}
        retrying={refreshing}
        skeletonRows={4}
        skeletonCards={3}
      />
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Routing Intelligence</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Territory coverage, route packs, travel burden, and staffing logistics for {data.territoryLabel}
            {refreshing ? <span className="ml-2 text-violet-400/90">Updating…</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Refresh
        </button>
      </header>

      <AutomationSyncStatusBanner
        lastSyncedAt={lastSyncedAt}
        stale={stale}
        partialSync={meta?.partialSync}
        partialErrors={meta?.partialErrors}
        error={error}
        timedOut={timedOut}
        onRetry={refresh}
        retrying={refreshing}
      />

      <RoutingTerritoryOverview
        cards={routing?.territoryOverview ?? []}
        onSelectPack={setSelectedPackId}
      />

      {routing?.visualWorkspace ? (
        <RoutingVisualWorkspacePanel
          workspace={routing.visualWorkspace}
          geo={routing.geoVisualization}
          enrichedPacks={(routing.enrichedRoutePacks ?? []) as EnrichedRoutePack[]}
          selectedPackId={selectedPack?.routePackId ?? null}
          onSelectPack={setSelectedPackId}
          escalations={meta?.escalations ?? []}
          jobContexts={routing.jobContexts ?? {}}
          variants={data.decisionIntelligence?.variantPerformance ?? []}
        />
      ) : null}

      <RoutingTravelBurdenPanel
        packs={(routing?.enrichedRoutePacks ?? []) as EnrichedRoutePack[]}
        selectedPack={selectedPack}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <RoutingRouteQueue
          rows={routing?.routeQueues ?? []}
          onSelectPack={setSelectedPackId}
        />
        <RoutingPackBuilder
          packs={(routing?.enrichedRoutePacks ?? []) as EnrichedRoutePack[]}
          selectedPack={selectedPack}
          onSelectPack={setSelectedPackId}
          escalations={meta?.escalations ?? []}
          jobContexts={routing?.jobContexts ?? {}}
          variants={data.decisionIntelligence?.variantPerformance ?? []}
        />
      </div>

      <RoutingCoverageMapPlaceholder geo={routing?.geoVisualization} clusters={routing?.geoVisualization?.nodes ?? []} />
    </div>
  );
}
