"use client";

import { useMemo, useState } from "react";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { useLoadingCeiling, DASHBOARD_LOADING_CEILING_MS } from "@/hooks/use-loading-ceiling";
import { ROUTING_INTELLIGENCE_CLIENT_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import { RoutingSyncBanner } from "@/components/recruiting/routing-intelligence/routing-sync-banner";
import { RoutingTerritoryOverview } from "@/components/recruiting/routing-intelligence/routing-territory-overview";
import { RoutingRouteQueue } from "@/components/recruiting/routing-intelligence/routing-route-queue";
import { RoutingPackBuilder } from "@/components/recruiting/routing-intelligence/routing-pack-builder";
import { RoutingCoverageMapPlaceholder } from "@/components/recruiting/routing-intelligence/routing-coverage-map-placeholder";
import { RoutingTravelBurdenPanel } from "@/components/recruiting/routing-intelligence/routing-travel-burden-panel";
import { RoutingVisualWorkspacePanel } from "@/components/recruiting/routing-intelligence/routing-visual-workspace";
import { RoutingWorkspaceMetricsStrip } from "@/components/recruiting/routing-intelligence/routing-workspace-metrics-strip";
import { RoutingScopeFilters } from "@/components/recruiting/routing-intelligence/routing-scope-filters";
import { CoverageOptimizationCenter } from "@/components/coverage-optimization/coverage-optimization-center";
import { useRoutingIntelligence } from "@/hooks/use-routing-intelligence";
import type { EnrichedRoutePack } from "@/lib/routing-intelligence/types";

export function RoutingIntelligenceSection() {
  const {
    summary,
    routing,
    scope,
    setScope,
    buildPacks,
    loadingSummary,
    buildingPacks,
    error,
    packsError,
    timedOut,
    stale,
    lastSyncedAt,
    refresh,
  } = useRoutingIntelligence();

  const loadingCeilingHit = useLoadingCeiling(
    loadingSummary,
    ROUTING_INTELLIGENCE_CLIENT_TIMEOUT_MS + DASHBOARD_LOADING_CEILING_MS,
  );
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);

  const selectedPack = useMemo(() => {
    const packs = routing?.enrichedRoutePacks ?? [];
    if (!selectedPackId) return packs[0] ?? null;
    return packs.find((pack) => pack.routePackId === selectedPackId) ?? packs[0] ?? null;
  }, [routing?.enrichedRoutePacks, selectedPackId]);

  if (loadingSummary && !summary) {
    return (
      <DashboardSectionFallback
        title="Routing Intelligence"
        loadingMessage="Loading routing summary…"
        isLoading
        loadingCeilingHit={loadingCeilingHit}
        timedOut={timedOut}
        onRetry={refresh}
        retrying={loadingSummary}
        skeletonRows={4}
        skeletonCards={3}
      />
    );
  }

  if (!summary) {
    return (
      <DashboardSectionFallback
        title="Routing Intelligence"
        error={error ?? "Failed to load routing intelligence"}
        timedOut={timedOut}
        onRetry={refresh}
        retrying={loadingSummary}
        skeletonRows={4}
        skeletonCards={3}
      />
    );
  }

  const showOperational = Boolean(routing?.routeQueues?.length || routing?.visualWorkspace);
  const showDetail = Boolean(routing?.enrichedRoutePacks?.length);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Routing Intelligence</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Summary-first routing scope for {summary.territoryLabel}
            {buildingPacks ? <span className="ml-2 text-violet-400/90">Building route packs…</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loadingSummary}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Refresh
        </button>
      </header>

      <RoutingSyncBanner syncing={buildingPacks} stale={stale} cacheHit={summary.loadState.cacheHit} />

      {error ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {error}
        </p>
      ) : null}

      <p className="text-xs text-zinc-500">Last synced: {lastSyncedAt ?? summary.fetchedAt}</p>

      <CoverageOptimizationCenter />

      <RoutingWorkspaceMetricsStrip metrics={summary.metrics} />

      <RoutingTerritoryOverview cards={summary.territoryOverview} onSelectPack={() => {}} />

      <RoutingScopeFilters
        options={summary.filterOptions}
        value={scope}
        onChange={setScope}
        onBuild={() => void buildPacks(scope)}
        building={buildingPacks}
        packsError={packsError}
      />

      {showOperational && routing?.visualWorkspace ? (
        <RoutingVisualWorkspacePanel
          workspace={routing.visualWorkspace}
          geo={routing.geoVisualization}
          enrichedPacks={(routing.enrichedRoutePacks ?? []) as EnrichedRoutePack[]}
          selectedPackId={selectedPack?.routePackId ?? null}
          onSelectPack={setSelectedPackId}
          escalations={[]}
          jobContexts={routing.jobContexts ?? {}}
          variants={[]}
          showOperational
          showDetail={showDetail}
        />
      ) : (
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Route packs are deferred until a routing scope is selected.
        </section>
      )}

      {showOperational ? (
        <RoutingTravelBurdenPanel
          packs={(routing?.enrichedRoutePacks ?? []) as EnrichedRoutePack[]}
          selectedPack={selectedPack}
        />
      ) : null}

      {showOperational ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <RoutingRouteQueue rows={routing?.routeQueues ?? []} onSelectPack={setSelectedPackId} />
          {showDetail ? (
            <RoutingPackBuilder
              packs={(routing?.enrichedRoutePacks ?? []) as EnrichedRoutePack[]}
              selectedPack={selectedPack}
              onSelectPack={setSelectedPackId}
              escalations={[]}
              jobContexts={routing?.jobContexts ?? {}}
              variants={[]}
            />
          ) : null}
        </div>
      ) : null}

      {showDetail ? (
        <RoutingCoverageMapPlaceholder
          geo={routing?.geoVisualization}
          clusters={routing?.geoVisualization?.nodes ?? []}
        />
      ) : null}
    </div>
  );
}
