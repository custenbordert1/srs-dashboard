"use client";

import type { WorkforcePlacementDashboardSnapshot } from "@/lib/workforce-placement-intelligence";
import { useCallback, useEffect, useState } from "react";

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function capacityTone(status: string): string {
  switch (status) {
    case "critical":
      return "text-rose-300";
    case "understaffed":
      return "text-amber-300";
    case "watch":
      return "text-yellow-300";
    case "surplus_capacity":
      return "text-sky-300";
    default:
      return "text-emerald-300";
  }
}

function priorityTone(level: string): string {
  switch (level) {
    case "critical":
      return "border-rose-500/40 bg-rose-500/10 text-rose-100";
    case "high":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    default:
      return "border-sky-500/35 bg-sky-500/10 text-sky-100";
  }
}

export function WorkforcePlacementPanel() {
  const [dashboard, setDashboard] = useState<WorkforcePlacementDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/workforce-placement-intelligence", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: WorkforcePlacementDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load workforce placement preview");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load workforce placement preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sample = dashboard?.sampleRecommendation;

  if (loading && !dashboard) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Workforce Placement Intelligence</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Workforce Placement Intelligence</h2>
        <p className="mt-2 text-sm text-amber-200/90">{error}</p>
      </section>
    );
  }

  if (!dashboard) return null;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Workforce Placement Intelligence</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Recommends hiring markets and how many reps to hire — not individual project assignments.
          </p>
        </div>
        <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-100">
          Preview Mode
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Ready For Work" value={String(dashboard.metrics.totalReadyForWork)} />
        <MetricCard label="Eligible For Placement" value={String(dashboard.metrics.eligibleForPlacement)} />
        <MetricCard label="Human Review" value={String(dashboard.metrics.humanReviewCount)} />
        <MetricCard
          label="Avg Market Demand"
          value={`${dashboard.metrics.averageMarketDemand}%`}
        />
        <MetricCard
          label="Recommended Markets"
          value={String(dashboard.metrics.recommendedMarketCount)}
        />
        <MetricCard
          label="Priority Markets"
          value={String(dashboard.metrics.priorityMarketCount)}
        />
        <MetricCard
          label="Awaiting Placement"
          value={String(dashboard.metrics.candidatesAwaitingPlacement)}
        />
        <MetricCard
          label="Recommendations"
          value={String(dashboard.recommendations.length)}
        />
        <MetricCard
          label="Recommended New Reps"
          value={String(dashboard.metrics.totalRecommendedNewReps)}
          hint="Across all markets"
        />
        <MetricCard
          label="Understaffed Markets"
          value={String(dashboard.metrics.understaffedMarketCount)}
        />
        <MetricCard
          label="Healthy Markets"
          value={String(dashboard.metrics.healthyMarketCount)}
        />
      </div>

      {dashboard.workforcePlanning.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-zinc-200">Workforce Planning</h3>
          <p className="mt-1 text-xs text-zinc-500">
            How many reps to hire per market based on open store load and active coverage.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-zinc-300">
              <thead className="text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Market</th>
                  <th className="px-2 py-1.5 font-medium">Demand</th>
                  <th className="px-2 py-1.5 font-medium">Open Stores</th>
                  <th className="px-2 py-1.5 font-medium">Active Reps</th>
                  <th className="px-2 py-1.5 font-medium">New Reps</th>
                  <th className="px-2 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.workforcePlanning.slice(0, 10).map((plan) => (
                  <tr key={plan.marketKey} className="border-t border-zinc-800/80 align-top">
                    <td className="px-2 py-1.5">
                      <p>{plan.marketLabel}</p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">{plan.reason}</p>
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{plan.demandScore}</td>
                    <td className="px-2 py-1.5 tabular-nums">{plan.openStoreCount}</td>
                    <td className="px-2 py-1.5 tabular-nums">{plan.activeRepresentativeCount}</td>
                    <td className="px-2 py-1.5 tabular-nums font-semibold text-violet-300">
                      {plan.recommendedNewReps}
                    </td>
                    <td className={`px-2 py-1.5 font-medium ${capacityTone(plan.status)}`}>
                      {plan.statusLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {dashboard.sampleCapacityPlan ? (
        <div className="mt-5 rounded-xl border border-zinc-700/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Sample Capacity Plan</h3>
          <p className="mt-2 text-sm font-medium text-zinc-100">{dashboard.sampleCapacityPlan.marketLabel}</p>
          <p className="mt-1 text-xs text-zinc-400">
            Demand {dashboard.sampleCapacityPlan.demandScore} · Open Stores{" "}
            {dashboard.sampleCapacityPlan.openStoreCount} · Active Reps{" "}
            {dashboard.sampleCapacityPlan.activeRepresentativeCount}
          </p>
          <p className="mt-2 text-sm text-violet-200">
            Recommended New Reps: {dashboard.sampleCapacityPlan.recommendedNewReps}
          </p>
          <p className={`mt-1 text-xs font-medium ${capacityTone(dashboard.sampleCapacityPlan.status)}`}>
            {dashboard.sampleCapacityPlan.statusLabel}
          </p>
          <p className="mt-1 text-xs text-zinc-500">{dashboard.sampleCapacityPlan.reason}</p>
        </div>
      ) : null}

      {dashboard.priorityMarkets.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-zinc-200">Priority Markets</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {dashboard.priorityMarkets.map((market) => (
              <div
                key={market.marketKey}
                className={`rounded-lg border px-3 py-2 text-xs ${priorityTone(market.level)}`}
              >
                <p className="font-semibold">{market.marketLabel}</p>
                <p className="mt-0.5 opacity-90">{market.reason}</p>
                <p className="mt-0.5 opacity-75">Expires {new Date(market.expiresAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {dashboard.recommendedMarkets.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-zinc-200">Coverage Opportunities</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-zinc-300">
              <thead className="text-zinc-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Market</th>
                  <th className="px-2 py-1.5 font-medium">Open Stores</th>
                  <th className="px-2 py-1.5 font-medium">Active Reps</th>
                  <th className="px-2 py-1.5 font-medium">Demand</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recommendedMarkets.slice(0, 8).map((market) => (
                  <tr key={market.marketKey} className="border-t border-zinc-800/80">
                    <td className="px-2 py-1.5">{market.marketLabel}</td>
                    <td className="px-2 py-1.5 tabular-nums">{market.openStoreCount}</td>
                    <td className="px-2 py-1.5 tabular-nums">{market.activeRepresentativeCount}</td>
                    <td className="px-2 py-1.5 tabular-nums font-semibold text-emerald-300">
                      {market.demandScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {dashboard.humanReviewQueue.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-zinc-200">Human Review Queue</h3>
          <ul className="mt-2 space-y-2">
            {dashboard.humanReviewQueue.slice(0, 6).map((entry) => (
              <li
                key={entry.candidateId}
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100"
              >
                <p className="font-semibold">{entry.candidateName}</p>
                <p className="mt-0.5 text-amber-200/80">{entry.reasons.join(" · ")}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sample ? (
        <div className="mt-5 rounded-xl border border-zinc-700/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Sample Recommendation</h3>
          <p className="mt-2 text-sm text-zinc-300">
            <span className="font-medium text-zinc-100">{sample.candidateName}</span>
            {" → "}
            <span className="font-medium text-emerald-300">{sample.recommendedMarketLabel}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Confidence {sample.confidenceScore}% · Demand {sample.demandScore}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            {sample.reasoning.map((reason) => (
              <li key={reason.id}>✓ {reason.label}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">{sample.coverageImpact}</p>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 text-xs text-zinc-500">
          {warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
