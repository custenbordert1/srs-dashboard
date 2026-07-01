"use client";

import { WorkforceCsvUploadPanel } from "@/components/workforce/workforce-csv-upload-panel";
import { WorkforceMetricsDashboard } from "@/components/workforce/workforce-metrics-dashboard";
import { ExecutiveApiDegradedState } from "@/components/executive/executive-tab-loading-fallback";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import {
  DASHBOARD_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";
import { logDashboardFetch } from "@/lib/dashboard-fetch-log";
import { useCallback, useEffect, useState } from "react";
import type { WorkforceImportStats } from "@/lib/workforce-intelligence/workforce-csv-import";

type StoreMeta = {
  importedAt: string | null;
  importedBy: string | null;
  repCount: number;
  activeRosterCount?: number;
  inactiveArchiveCount?: number;
  terminatedArchiveCount?: number;
};

export function WorkforceIntelligencePanel() {
  const [meta, setMeta] = useState<StoreMeta | null>(null);
  const [stats, setStats] = useState<WorkforceImportStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const loadingCeilingHit = useLoadingCeiling(loading && !stats, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  const refreshMeta = useCallback(async () => {
    const route = "/api/workforce-intelligence";
    const started = performance.now();
    logDashboardFetch("start", { route, label: "workforce-intelligence" });
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(route, {
        cache: "no-store",
        timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
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
        logDashboardFetch("success", {
          route,
          label: "workforce-intelligence",
          ms: Math.round(performance.now() - started),
        });
      } else {
        const message = parsed.error ?? "Workforce intelligence unavailable";
        setError(message);
        logDashboardFetch("error", {
          route,
          label: "workforce-intelligence",
          ms: Math.round(performance.now() - started),
          error: message,
        });
      }
    } catch (err) {
      const message = isTimeoutError(err)
        ? timeoutErrorMessage("Workforce intelligence", DASHBOARD_REQUEST_TIMEOUT_MS)
        : err instanceof Error
          ? err.message
          : "Failed to load workforce intelligence";
      setError(message);
      logDashboardFetch(isTimeoutError(err) ? "timeout" : "error", {
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

  return (
    <div className="space-y-6">
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
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          No workforce CSV imported yet. Upload active-reps-clean.csv to activate matching.
        </p>
      )}

      <WorkforceCsvUploadPanel onImportComplete={refreshMeta} />

      {loading && !stats ? (
        loadingCeilingHit ? (
          <ExecutiveApiDegradedState
            source="workforce-intelligence"
            message="Workforce metrics are taking longer than expected."
            onRetry={retry}
            retrying={retrying}
            timedOut
          />
        ) : (
          <DashboardSectionFallback
            title="Workforce metrics"
            loadingMessage="Loading workforce metrics…"
            isLoading
            skeletonRows={2}
            skeletonCards={4}
          />
        )
      ) : error && !stats ? (
        <ExecutiveApiDegradedState
          source="workforce-intelligence"
          message={error}
          onRetry={retry}
          retrying={retrying}
          timedOut={error.toLowerCase().includes("timed out")}
        />
      ) : stats ? (
        <WorkforceMetricsDashboard stats={stats} />
      ) : (
        <DashboardSectionFallback
          title="Workforce metrics"
          isEmpty
          emptyMessage="Import active-reps-clean.csv above to populate workforce metrics."
        />
      )}
    </div>
  );
}
