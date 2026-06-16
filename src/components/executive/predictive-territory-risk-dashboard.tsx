"use client";

import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import {
  fetchExecutiveIntelligenceRoute,
  scheduleExecutiveBackgroundRefresh,
} from "@/lib/executive-routes/executive-intelligence-client";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import {
  PREDICTIVE_RISK_LEVEL_LABELS,
  PREDICTIVE_RISK_TREND_LABELS,
  type PredictiveRiskForecast,
  type PredictiveTerritoryRiskRow,
  type PredictiveTerritoryRiskSnapshot,
} from "@/lib/predictive-territory-risk";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import {
  UI_BADGE,
  UI_BUTTON,
  UI_LAYOUT,
  UI_RISK,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useState } from "react";

type PredictiveRiskResponse = {
  ok?: boolean;
  error?: string;
  snapshot?: PredictiveTerritoryRiskSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
  };
};

const LEVEL_STYLES = {
  critical: UI_RISK.critical,
  high: UI_RISK.atRisk,
  moderate: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  stable: UI_RISK.stable,
};

const TREND_STYLES = {
  improving: "text-emerald-300",
  stable: "text-zinc-300",
  declining: "text-red-300",
};

function navigateTo(destination: PredictiveTerritoryRiskRow["navigation"]) {
  navigateRecruitingTab({
    tab: destination.tabId,
    elementId: destination.elementId,
  });
}

function TerritoryTable({
  title,
  subtitle,
  rows,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  rows: PredictiveTerritoryRiskRow[];
  emptyMessage: string;
}) {
  return (
    <section className={UI_SPACE.section}>
      <div>
        <h2 className={UI_TYPE.sectionTitle}>{title}</h2>
        <p className={UI_TYPE.sectionSubtitle}>{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <WorkspaceEmptyState title={emptyMessage} message="No territories match this ranking." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800/80">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-800/80 bg-zinc-950/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Territory / DM</th>
                <th className="px-4 py-3">Risk</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Trend</th>
                <th className="px-4 py-3">Coverage</th>
                <th className="px-4 py-3">Open calls</th>
                <th className="px-4 py-3">Alerts</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {rows.map((row) => (
                <tr key={row.entityId} className="bg-zinc-950/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-100">{row.label}</p>
                    <p className="text-xs text-zinc-500">{row.states.join(", ")}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-zinc-100">{row.riskScore}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${LEVEL_STYLES[row.riskLevel]}`}>
                      {PREDICTIVE_RISK_LEVEL_LABELS[row.riskLevel]}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs font-medium ${TREND_STYLES[row.trend]}`}>
                    {PREDICTIVE_RISK_TREND_LABELS[row.trend]}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">{row.coveragePercent}%</td>
                  <td className="px-4 py-3 text-zinc-300">{row.openCalls}</td>
                  <td className="px-4 py-3 text-zinc-300">{row.alertCount}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className={UI_BUTTON.secondary} onClick={() => navigateTo(row.navigation)}>
                      {row.navigation.label}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ForecastList({ forecasts }: { forecasts: PredictiveRiskForecast[] }) {
  if (forecasts.length === 0) {
    return (
      <WorkspaceEmptyState
        title="No forecasts generated"
        message="Forecasts appear when stores or territories show early failure signals."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {forecasts.map((forecast) => (
        <li
          key={forecast.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100">{forecast.label}</p>
            <p className="text-xs text-zinc-500">{forecast.dmName}</p>
            <p className="mt-1 text-sm text-zinc-300">{forecast.reason}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.moderate}`}>
              {forecast.confidence}% confidence
            </span>
            <button
              type="button"
              className={UI_BUTTON.secondary}
              onClick={() =>
                navigateRecruitingTab({
                  tab: forecast.navigation.tabId,
                  elementId: forecast.navigation.elementId,
                })
              }
            >
              {forecast.navigation.label}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PredictiveTerritoryRiskDashboard() {
  const [data, setData] = useState<PredictiveRiskResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { snapshot, meta } = await fetchExecutiveIntelligenceRoute<PredictiveTerritoryRiskSnapshot>(
        "/api/predictive-territory-risk",
        { force },
      );
      setData({ ok: true, snapshot, meta });
      if (!force) scheduleExecutiveBackgroundRefresh((nextForce) => void load(nextForce), meta);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const snapshot = data?.snapshot;
  const cacheLabel = data?.meta?.intelligenceCache
    ? `${data.meta.intelligenceCache.cacheStatus} · ${Math.round(data.meta.intelligenceCache.snapshotAgeMs / 1000)}s`
    : null;

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot)}
      loadingMessage="Forecasting territory risk…"
      emptyTitle="No predictive risk data"
      emptyMessage="Predictive territory risk will appear once recruiting intelligence is available."
      onRefresh={() => void load(true)}
      partialDataAvailable={Boolean(snapshot)}
    >
      {snapshot ? (
        <div id="predictive-territory-risk-dashboard" className={UI_SPACE.page}>
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Predictive Territory Risk</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Forecast recruiting and coverage failures before they happen — powered only by the unified intelligence cache.
              </p>
            </div>
            <div className={`${UI_LAYOUT.toolbar} items-center`}>
              {cacheLabel ? (
                <span className="rounded border border-zinc-700/80 px-2 py-1 text-[10px] text-zinc-400">
                  Intel cache · {cacheLabel}
                </span>
              ) : null}
              <button
                type="button"
                className={UI_BUTTON.secondary}
                disabled={refreshing}
                onClick={() => void load(true)}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className={`${UI_SURFACE.panel} ${UI_SPACE.gridKpi}`}>
            <div>
              <p className={UI_TYPE.kpiLabel}>Critical territories</p>
              <p className={`${UI_TYPE.kpiValue} text-red-200`}>
                {snapshot.executiveSummary.totalCriticalTerritories}
              </p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>High risk territories</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.totalHighRiskTerritories}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Projects at risk</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.projectsAtRisk}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Predicted coverage gap</p>
              <p className={`${UI_TYPE.kpiValue} text-amber-200`}>
                {snapshot.executiveSummary.predictedCoverageGap}%
              </p>
            </div>
          </div>

          <TerritoryTable
            title="Top 25 Highest Risk Territories"
            subtitle="Ranked by predictive 0–100 risk score across open calls, pipeline, velocity, coverage, alerts, and follow-ups."
            rows={snapshot.highestRiskTerritories}
            emptyMessage="No elevated territory risk detected."
          />

          <TerritoryTable
            title="Top 25 Healthiest Territories"
            subtitle="Lowest predictive risk with improving or stable trend signals."
            rows={snapshot.healthiestTerritories}
            emptyMessage="No healthy territory benchmarks yet."
          />

          <section className={UI_SPACE.section}>
            <div>
              <h2 className={UI_TYPE.sectionTitle}>Forecasts</h2>
              <p className={UI_TYPE.sectionSubtitle}>
                Stores likely to hit zero pipeline, territories missing completion goals, and DMs below coverage targets.
              </p>
            </div>
            <ForecastList forecasts={snapshot.forecasts} />
          </section>

          <section className={UI_SPACE.section}>
            <div>
              <h2 className={UI_TYPE.sectionTitle}>Recommended Actions</h2>
              <p className={UI_TYPE.sectionSubtitle}>
                Highest-risk territories with generated intervention recommendations.
              </p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {snapshot.highestRiskTerritories.slice(0, 6).map((row) => (
                <article
                  key={`rec-${row.entityId}`}
                  className={`rounded-xl border p-4 ${LEVEL_STYLES[row.riskLevel]}`}
                >
                  <h3 className="text-sm font-semibold text-zinc-50">{row.label}</h3>
                  <ul className="mt-2 space-y-2">
                    {row.recommendations.map((rec) => (
                      <li key={`${row.entityId}:${rec.kind}`} className="text-sm">
                        <button
                          type="button"
                          className="font-medium text-teal-100 hover:underline"
                          onClick={() => navigateRecruitingTab({
                            tab: rec.navigation.tabId,
                            elementId: rec.navigation.elementId,
                          })}
                        >
                          {rec.label}
                        </button>
                        <p className="text-xs text-zinc-400">{rec.reason}</p>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
