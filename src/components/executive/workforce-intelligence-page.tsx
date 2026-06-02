"use client";

import type { UserPublic } from "@/lib/auth/types";
import { AppShell } from "@/components/auth/app-shell";
import { WorkforceCsvUploadPanel } from "@/components/workforce/workforce-csv-upload-panel";
import { WorkforceMetricsDashboard } from "@/components/workforce/workforce-metrics-dashboard";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { DataTrustBadge, DataTrustStatusBanner } from "@/components/ui/data-trust-badge";
import { useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import {
  fetchWithTimeout,
  FETCH_T3_TERRITORY_MS,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";
import { logDashboardFetch } from "@/lib/dashboard-fetch-log";
import { buildDataTrustState, type DataTrustInput } from "@/lib/data-trust-state";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorkforceImportStats } from "@/lib/workforce-intelligence/workforce-csv-import";

type StoreMeta = {
  importedAt: string | null;
  importedBy: string | null;
  repCount: number;
  activeRosterCount?: number;
  inactiveArchiveCount?: number;
  terminatedArchiveCount?: number;
};

export function WorkforceIntelligencePage({ user }: { user: UserPublic }) {
  const [meta, setMeta] = useState<StoreMeta | null>(null);
  const [stats, setStats] = useState<WorkforceImportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const loadingCeilingHit = useLoadingCeiling(loading);

  const refreshMeta = useCallback(async () => {
    const route = "/api/workforce-intelligence";
    const started = performance.now();
    logDashboardFetch("start", { route, label: "workforce-intelligence" });
    setLoading(true);
    setError(null);
    setTimedOut(false);
    try {
      const res = await fetchWithTimeout(route, {
        cache: "no-store",
        timeoutMs: FETCH_T3_TERRITORY_MS,
      });
      const parsed = (await res.json()) as {
        ok?: boolean;
        meta?: StoreMeta;
        stats?: WorkforceImportStats;
        error?: string;
      };
      if (parsed.ok) {
        setMeta(parsed.meta ?? null);
        setStats(parsed.stats ?? null);
        logDashboardFetch("success", { route, label: "workforce-intelligence", ms: Math.round(performance.now() - started) });
      } else {
        const message = parsed.error ?? "Workforce intelligence unavailable";
        setError(message);
        logDashboardFetch("error", { route, label: "workforce-intelligence", ms: Math.round(performance.now() - started), error: message });
      }
    } catch (err) {
      const timedOutError = isTimeoutError(err);
      const message = timedOutError
        ? timeoutErrorMessage("Workforce intelligence", FETCH_T3_TERRITORY_MS)
        : err instanceof Error
          ? err.message
          : "Failed to load workforce intelligence";
      setTimedOut(timedOutError);
      setError(message);
      logDashboardFetch(timedOutError ? "timeout" : "error", {
        route,
        label: "workforce-intelligence",
        ms: Math.round(performance.now() - started),
        error: message,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void refreshMeta(), 0);
    return () => window.clearTimeout(id);
  }, [refreshMeta]);

  const retry = useCallback(() => {
    setRetrying(true);
    void refreshMeta().finally(() => setRetrying(false));
  }, [refreshMeta]);

  const rosterImported = Boolean(meta?.importedAt);

  const trustInput: DataTrustInput = useMemo(
    () => ({
      loading,
      hasData: Boolean(stats) && rosterImported,
      error: error ?? (!rosterImported && !loading ? "No workforce CSV imported" : null),
      timedOut,
      stale: Boolean(stats && error),
    }),
    [error, loading, rosterImported, stats, timedOut],
  );

  const dataTrust = useMemo(() => buildDataTrustState(trustInput), [trustInput]);

  return (
    <AppShell
      user={user}
      title="Workforce Intelligence"
      subtitle="Import active-reps-clean.csv to power live rep matching, coverage analytics, and staffing recommendations."
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {meta?.importedAt ? (
            <p className="text-sm text-zinc-500">
              Last import: {new Date(meta.importedAt).toLocaleString()}
              {meta.importedBy ? ` · ${meta.importedBy}` : ""} · {meta.activeRosterCount ?? meta.repCount}{" "}
              active in roster
              {(meta.inactiveArchiveCount ?? 0) + (meta.terminatedArchiveCount ?? 0) > 0
                ? ` · ${meta.inactiveArchiveCount ?? 0} inactive + ${meta.terminatedArchiveCount ?? 0} terminated archived`
                : ""}
            </p>
          ) : (
            <p className="text-sm text-zinc-500">No workforce CSV imported yet.</p>
          )}
          <DataTrustBadge trust={trustInput} state={dataTrust} />
        </div>

        <DataTrustStatusBanner
          trust={trustInput}
          state={dataTrust}
          onRetry={retry}
          retrying={retrying || loading}
        />

        {!rosterImported && !loading ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            No workforce CSV imported yet. Upload active-reps-clean.csv to activate matching.
          </p>
        ) : null}

        <WorkforceCsvUploadPanel onImportComplete={refreshMeta} />

        {loading && !stats ? (
          <DashboardSectionFallback
            title="Workforce metrics"
            loadingMessage="Loading workforce metrics…"
            isLoading
            loadingCeilingHit={loadingCeilingHit}
            onRetry={retry}
            retrying={retrying}
            skeletonRows={2}
            skeletonCards={4}
          />
        ) : error && !stats ? (
          <DashboardSectionFallback
            title="Workforce metrics"
            error={error}
            timedOut={timedOut}
            onRetry={retry}
            retrying={retrying}
          />
        ) : stats ? (
          <WorkforceMetricsDashboard stats={stats} trustState={dataTrust} trustInput={trustInput} />
        ) : (
          <DashboardSectionFallback
            title="Workforce metrics"
            isEmpty
            emptyMessage="Import active-reps-clean.csv above to populate workforce metrics."
          />
        )}
      </div>
    </AppShell>
  );
}
