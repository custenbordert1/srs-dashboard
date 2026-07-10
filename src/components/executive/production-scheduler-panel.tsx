"use client";

import {
  LastUpdatedBadge,
  SectionDegradedBanner,
  SectionErrorCard,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import {
  ExecutiveCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import {
  recommendationLabel,
  recommendationTone,
  scenarioLabel,
} from "@/lib/p167-intelligent-production-scheduler/presentation";
import { P167_DROPBOX_CYCLE_BUDGET } from "@/lib/p167-intelligent-production-scheduler/constants";
import type { P167SimulationScenario } from "@/lib/p167-intelligent-production-scheduler/types";
import { useProductionScheduler } from "@/hooks/use-production-scheduler";
import { useState } from "react";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function formatTimeSince(ms: number | null): string {
  if (ms == null) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

export function ProductionSchedulerPanel() {
  const { report, error, loading, loadingCeilingHit, showingCachedSnapshot, meta, refresh } =
    useProductionScheduler();
  const [activeScenario, setActiveScenario] = useState<P167SimulationScenario>("run_now");

  if (loading) {
    return <SectionLoadingCard title="Production Scheduler" badge="P167" />;
  }

  if (loadingCeilingHit && !report) {
    return (
      <SectionErrorCard
        title="Production Scheduler"
        badge="P167"
        message="Scheduler assessment timed out — dependency probes may still be running."
        onRetry={() => void refresh()}
      />
    );
  }

  if (!report) {
    return (
      <SectionErrorCard
        title="Production Scheduler"
        badge="P167"
        message={error ?? "Failed to load production scheduler"}
        onRetry={() => void refresh()}
      />
    );
  }

  const d = report.decision;
  const c = report.context;
  const apiBudgetRemaining = Math.max(
    0,
    P167_DROPBOX_CYCLE_BUDGET - d.projectedDropboxApiUsage.totalRequests,
  );
  const dropboxHeadroom =
    c.dropboxRateLimitRemaining != null ? c.dropboxRateLimitRemaining : "—";
  const activeSim =
    report.simulations.find((s) => s.scenario === activeScenario) ?? report.simulations[0];

  return (
    <div className="space-y-6">
      {(showingCachedSnapshot || error) && (
        <SectionDegradedBanner
          stale={showingCachedSnapshot}
          message={error ?? "Showing cached scheduler snapshot."}
          onRetry={() => void refresh()}
        />
      )}

      <ExecutiveCard id="p167-scheduler" variant="premium">
        <SectionHeader
          title="Production Scheduler"
          subtitle="Read-only decision engine — does not run cycles or send paperwork"
          badge="P167"
          actions={
            <LastUpdatedBadge
              at={report.generatedAt}
              stale={showingCachedSnapshot}
              ageSeconds={meta?.ageSeconds ?? null}
              refreshing={meta?.refreshing}
            />
          }
        />

        <div className="mb-4 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={recommendationTone(d.recommendation)}>
              {recommendationLabel(d.recommendation)}
            </StatusBadge>
            <span className="text-sm text-zinc-400">Confidence {d.confidence}%</span>
          </div>
          <p className="mt-2 text-sm text-zinc-300">{d.reason}</p>
          {d.limitingFactor && (
            <p className="mt-1 text-xs text-amber-300/90">Limiting: {d.limitingFactor}</p>
          )}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Next recommended run" value={formatTimestamp(d.nextRecommendedRunAt)} />
          <MetricCard label="Expected sends" value={d.estimatedCandidatesNextCycle} />
          <MetricCard
            label="Queue reduction"
            value={Math.min(d.estimatedCandidatesNextCycle, c.queueRemaining)}
          />
          <MetricCard label="Expected Dropbox requests" value={d.projectedDropboxApiUsage.totalRequests} />
          <MetricCard label="API budget remaining" value={apiBudgetRemaining} />
          <MetricCard label="Dropbox headroom" value={dropboxHeadroom} />
          <MetricCard label="Last cycle" value={formatTimestamp(c.lastCycleAt)} />
          <MetricCard
            label="Last successful cycle"
            value={formatTimestamp(c.lastSuccessfulCycleAt)}
          />
          <MetricCard label="Time since last cycle" value={formatTimeSince(c.timeSinceLastCycleMs)} />
          <MetricCard label="Projected queue after" value={d.projectedQueueAfterCycle} />
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Production cycle timeline
          </h3>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>

        {report.timeline.length === 0 ? (
          <p className="text-sm text-zinc-500">No live production cycles recorded.</p>
        ) : (
          <div className="mb-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Duration</th>
                  <th className="px-2 py-2">Sent</th>
                  <th className="px-2 py-2">API</th>
                  <th className="px-2 py-2">Errors</th>
                  <th className="px-2 py-2">Queue before</th>
                  <th className="px-2 py-2">Queue after</th>
                </tr>
              </thead>
              <tbody>
                {report.timeline.map((row) => (
                  <tr key={row.cycleId} className="border-b border-zinc-800/60 text-zinc-300">
                    <td className="px-2 py-2">{formatTimestamp(row.completedAt ?? row.startedAt)}</td>
                    <td className="px-2 py-2">{formatDuration(row.durationMs)}</td>
                    <td className="px-2 py-2">{row.paperworkSent}</td>
                    <td className="px-2 py-2">
                      {row.apiRequestsEstimate}
                      <span className="ml-1 text-xs text-zinc-500">({row.apiRequestsSource})</span>
                    </td>
                    <td className="px-2 py-2">{row.errors}</td>
                    <td className="px-2 py-2">{row.queueBefore ?? "—"}</td>
                    <td className="px-2 py-2">{row.queueAfter ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          What-if simulator
        </h3>
        <p className="mb-3 text-xs text-zinc-500">
          Simulates scheduling outcomes only — no production actions are taken.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {report.simulations.map((sim) => (
            <button
              key={sim.scenario}
              type="button"
              onClick={() => setActiveScenario(sim.scenario)}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                activeScenario === sim.scenario
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                  : "border-zinc-700 text-zinc-300 hover:border-zinc-600"
              }`}
            >
              {scenarioLabel(sim.scenario)}
            </button>
          ))}
        </div>

        {activeSim && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone={recommendationTone(activeSim.recommendation)}>
                {recommendationLabel(activeSim.recommendation)}
              </StatusBadge>
              <span className="text-xs text-zinc-500">Scenario: {scenarioLabel(activeSim.scenario)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard label="Expected sends" value={activeSim.expectedSends} />
              <MetricCard label="API usage" value={activeSim.expectedApiUsage.total} />
              <MetricCard label="Queue reduction" value={activeSim.expectedQueueReduction} />
              <MetricCard label="Backlog after" value={activeSim.expectedBacklog} />
            </div>
            <ul className="mt-3 list-inside list-disc text-xs text-zinc-400">
              {activeSim.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </ExecutiveCard>
    </div>
  );
}
