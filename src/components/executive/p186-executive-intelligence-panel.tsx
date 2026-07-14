"use client";

import {
  LastUpdatedBadge,
  SectionDegradedBanner,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import {
  ExecutiveCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import type { P1866ExecutiveDashboard } from "@/lib/p186-6-executive-recruiting-intelligence";
import { useCallback, useEffect, useState } from "react";

function formatAge(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function P186ExecutiveIntelligencePanel() {
  const [dashboard, setDashboard] = useState<P1866ExecutiveDashboard | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recruiting/p186-executive/status?range=last_7_days", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        enabled?: boolean;
        dashboard?: P1866ExecutiveDashboard;
        message?: string;
      };
      setEnabled(Boolean(data.enabled));
      setDashboard(data.dashboard ?? null);
      setMessage(data.message ?? null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load P186 executive dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <SectionLoadingCard title="P186 Executive Recruiting Intelligence" badge="P186.6" />;
  }

  if (!enabled || !dashboard) {
    return (
      <ExecutiveCard>
        <SectionHeader
          title="P186 Executive Recruiting Intelligence"
          subtitle="Funnel, aging, health, bottlenecks, scorecards — flag off (idle)."
          badge="P186.6"
        />
        <p className="mt-3 text-sm text-zinc-400">
          Enable with <code className="text-zinc-300">P186_EXECUTIVE_DASHBOARD=1</code>. Read-only;
          never sends paperwork or exports to MEL.
        </p>
        {message ? (
          <div className="mt-3">
            <SectionDegradedBanner message={message} />
          </div>
        ) : null}
      </ExecutiveCard>
    );
  }

  const aging = dashboard.agingSummary;
  const paperwork = dashboard.paperwork;

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="P186 Executive Recruiting Intelligence"
          subtitle="Lifecycle funnel, candidate health, aging SLAs, bottlenecks, and forecasts."
          badge="P186.6"
        />
        <div className="flex flex-wrap items-center gap-2">
          <LastUpdatedBadge at={dashboard.freshnessAt} />
          <StatusBadge tone={dashboard.metricsConfident ? "success" : "warning"}>
            {dashboard.metricsConfident ? "fresh" : "stale sources"}
          </StatusBadge>
          <StatusBadge tone="neutral">read-only</StatusBadge>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
      </div>

      {!dashboard.metricsConfident ? (
        <div className="mt-4">
          <SectionDegradedBanner message="Required source data is stale or missing — treat metrics as degraded." />
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Funnel stages"
          value={String(dashboard.funnel?.length ?? 0)}
        />
        <MetricCard label="Critical aging" value={String(aging?.critical ?? 0)} />
        <MetricCard label="Exceptions" value={String(dashboard.exceptions?.length ?? 0)} />
        <MetricCard label="Ready for MEL" value={String(paperwork?.readyForMelBacklog ?? 0)} />
        <MetricCard label="Awaiting signature" value={String(paperwork?.awaitingSignature ?? 0)} />
        <MetricCard label="Missing docs" value={String(paperwork?.missingDocumentCases ?? 0)} />
        <MetricCard label="Bottlenecks" value={String(dashboard.bottlenecks?.length ?? 0)} />
        <MetricCard label="Forecasts" value={String(dashboard.forecasts?.length ?? 0)} />
      </div>

      {dashboard.funnel && dashboard.funnel.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase text-zinc-500">Lifecycle funnel</p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Stage</th>
                  <th className="px-2 py-2">Count</th>
                  <th className="px-2 py-2">Conv</th>
                  <th className="px-2 py-2">Avg age</th>
                  <th className="px-2 py-2">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.funnel.map((s) => (
                  <tr key={s.stage} className="border-t border-zinc-800/80 text-zinc-300">
                    <td className="px-2 py-2">{s.stage}</td>
                    <td className="px-2 py-2">{s.currentCount}</td>
                    <td className="px-2 py-2">
                      {s.conversionFromPrevious != null ? `${s.conversionFromPrevious}%` : "—"}
                    </td>
                    <td className="px-2 py-2">{formatAge(s.averageAgeMs)}</td>
                    <td className="px-2 py-2">{s.blockedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-zinc-500">No funnel cohort loaded (idle / empty).</p>
      )}

      {dashboard.consolidationNotes.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase text-zinc-500">Later consolidation</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-500">
            {dashboard.consolidationNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] text-zinc-600">
        Safety: production {dashboard.safety.productionWritesAttempted}, MEL{" "}
        {dashboard.safety.melWritesAttempted}, paperwork {dashboard.safety.paperworkSendsAttempted}.
        Cache {dashboard.cacheHit ? "hit" : "miss"}.
      </p>
    </ExecutiveCard>
  );
}
