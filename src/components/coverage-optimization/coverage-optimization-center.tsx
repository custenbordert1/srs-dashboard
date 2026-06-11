"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { buildDataTrustState } from "@/lib/data-trust-state";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type {
  CoverageOptimizationSnapshot,
  CoverageSimulationDelta,
  OpportunityRepRecommendation,
  RoutePlan,
} from "@/lib/coverage-optimization";
import { useEffect, useMemo, useState } from "react";

type OptimizationResponse = {
  ok?: boolean;
  snapshot?: CoverageOptimizationSnapshot;
  meta?: { partialSync?: boolean; hasMelData?: boolean; refreshedAt?: string };
  error?: string;
};

export function CoverageOptimizationCenter() {
  const [snapshot, setSnapshot] = useState<CoverageOptimizationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<OptimizationResponse["meta"]>();
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [simRemoveRepId, setSimRemoveRepId] = useState("");
  const [simAddRepId, setSimAddRepId] = useState("");
  const [simMoveRepId, setSimMoveRepId] = useState("");
  const [simMoveState, setSimMoveState] = useState("");
  const [simMoveCity, setSimMoveCity] = useState("");
  const [simDelta, setSimDelta] = useState<CoverageSimulationDelta | null>(null);
  const [selectedRec, setSelectedRec] = useState<OpportunityRepRecommendation | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/coverage-optimization", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as OptimizationResponse;
        if (cancelled) return;
        if (!parsed.ok || !parsed.snapshot) {
          setError(parsed.error ?? "Unable to load coverage optimization.");
          return;
        }
        setError(null);
        setSnapshot(parsed.snapshot);
        setMeta(parsed.meta);
        setSelectedRec((current) => current ?? parsed.snapshot!.recommendations[0] ?? null);
      } catch {
        if (!cancelled) setError("Unable to load coverage optimization.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const trustInput = useMemo(
    () => ({ hasData: Boolean(snapshot), partialSync: meta?.partialSync }),
    [snapshot, meta],
  );
  const trustState = useMemo(() => buildDataTrustState(trustInput), [trustInput]);

  const toggleOpportunity = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((row) => row !== id) : [...current, id],
    );
  };

  const buildRoute = async () => {
    if (selectedIds.length === 0) return;
    const res = await fetchWithTimeout("/api/coverage-optimization/route-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityIds: selectedIds }),
      timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
    });
    const parsed = (await res.json()) as { ok?: boolean; plan?: RoutePlan };
    if (parsed.ok && parsed.plan) setRoutePlan(parsed.plan);
  };

  const runSimulation = async () => {
    const res = await fetchWithTimeout("/api/coverage-optimization/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        removeRepIds: simRemoveRepId ? [simRemoveRepId] : [],
        addRepIds: simAddRepId ? [simAddRepId] : [],
        moveRep:
          simMoveRepId && simMoveState
            ? { repId: simMoveRepId, newState: simMoveState, newCity: simMoveCity || undefined }
            : undefined,
      }),
      timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
    });
    const parsed = (await res.json()) as { ok?: boolean; delta?: CoverageSimulationDelta };
    if (parsed.ok && parsed.delta) setSimDelta(parsed.delta);
  };

  const formatDelta = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

  if (loading && !snapshot) {
    return <p className="text-sm text-zinc-500">Loading coverage optimization engine…</p>;
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Coverage optimization engine</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Best rep, travel cost, and fill probability for every open call
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataTrustBadge trust={trustInput} state={trustState} />
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadToken((token) => token + 1);
            }}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Est. savings", value: `$${snapshot.executive.optimizationSavingsUsd}` },
          { label: "Avg fill probability", value: `${snapshot.executive.averageFillProbability}%` },
          {
            label: "No viable reps",
            value: String(snapshot.executive.territoriesWithNoViableReps.length),
          },
          { label: "Open calls ranked", value: String(snapshot.prioritizedOpenCalls.length) },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-base font-semibold text-zinc-50">Open call prioritization</h3>
          <div className="mt-3 max-h-72 overflow-y-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-1">Route</th>
                  <th className="px-2 py-1">Project</th>
                  <th className="px-2 py-1">Score</th>
                  <th className="px-2 py-1">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                {snapshot.prioritizedOpenCalls.slice(0, 12).map((row) => (
                  <tr key={row.opportunityId}>
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.opportunityId)}
                        onChange={() => toggleOpportunity(row.opportunityId)}
                      />
                    </td>
                    <td className="px-2 py-1.5">{row.projectName}</td>
                    <td className="px-2 py-1.5">{row.priorityScore}</td>
                    <td className="px-2 py-1.5">{row.staffingRisk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => void buildRoute()}
            disabled={selectedIds.length === 0}
            className="mt-3 rounded-lg border border-teal-600/40 px-3 py-1.5 text-xs text-teal-200 hover:bg-teal-500/10 disabled:opacity-50"
          >
            Build route ({selectedIds.length} stops)
          </button>
        </section>

        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-base font-semibold text-zinc-50">Rep recommendation</h3>
          {selectedRec ? (
            <div className="mt-3 space-y-2 text-sm text-zinc-300">
              <p className="font-medium text-zinc-100">{selectedRec.projectName}</p>
              {selectedRec.bestRep ? (
                <>
                  <p>
                    Best: {selectedRec.bestRep.repName} · confidence {selectedRec.confidenceScore}%
                  </p>
                  <p>
                    Fill probability {selectedRec.fillProbability}% ·{" "}
                    {selectedRec.bestRep.distanceMiles ?? "—"} mi · $
                    {selectedRec.bestRep.estimatedTravelCostUsd ?? "—"}
                  </p>
                  <ul className="text-xs text-zinc-400">
                    {selectedRec.alternatives.slice(0, 5).map((alt) => (
                      <li key={alt.repId}>
                        {alt.repName} — {alt.confidenceScore}% · {alt.matchScore} match
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-amber-200">No viable rep within territory radius.</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Select an opportunity below.</p>
          )}
        </section>
      </div>

      {routePlan ? (
        <section className="rounded-2xl border border-teal-500/25 bg-teal-500/5 p-4">
          <h3 className="text-base font-semibold text-teal-100">Route plan</h3>
          <p className="mt-1 text-sm text-teal-200/80">
            {routePlan.totalMiles} mi · {routePlan.totalDriveTimeMinutes} min · $
            {routePlan.estimatedTotalCostUsd} total
            {routePlan.overnightRecommended ? " · Hotel recommended" : ""}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-teal-100/90">
            {routePlan.stops.map((stop) => (
              <li key={stop.opportunityId}>
                {stop.city}, {stop.state} — {stop.projectName}
                {stop.distanceFromPreviousMiles !== null
                  ? ` (+${stop.distanceFromPreviousMiles} mi)`
                  : ""}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Coverage simulator</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Model roster changes and recalculate territory coverage, risk, and open-call impact.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-zinc-400">
            Remove rep ID
            <input
              value={simRemoveRepId}
              onChange={(e) => setSimRemoveRepId(e.target.value)}
              placeholder="rep-123"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Add rep ID
            <input
              value={simAddRepId}
              onChange={(e) => setSimAddRepId(e.target.value)}
              placeholder="rep-456"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Move rep ID
            <input
              value={simMoveRepId}
              onChange={(e) => setSimMoveRepId(e.target.value)}
              placeholder="rep-789"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Move to state
            <input
              value={simMoveState}
              onChange={(e) => setSimMoveState(e.target.value.toUpperCase())}
              placeholder="TX"
              maxLength={2}
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Move to city (optional)
            <input
              value={simMoveCity}
              onChange={(e) => setSimMoveCity(e.target.value)}
              placeholder="Dallas"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void runSimulation()}
          className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Recalculate coverage
        </button>
        {simDelta ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm text-zinc-300">
            <p>
              Coverage: <span className="text-zinc-100">{simDelta.territoryCoveragePercent}%</span>{" "}
              ({formatDelta(simDelta.deltaCoveragePercent)})
            </p>
            <p>
              Risk score: <span className="text-zinc-100">{simDelta.coverageRiskScore}</span>{" "}
              ({formatDelta(simDelta.deltaRiskScore)})
            </p>
            <p>
              Open calls impacted: <span className="text-zinc-100">{simDelta.openCallsImpacted}</span>
            </p>
            <p>
              At-risk territories: <span className="text-zinc-100">{simDelta.atRiskTerritories}</span>
            </p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">All recommendations</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Project</th>
                <th className="px-2 py-2">Best rep</th>
                <th className="px-2 py-2">Confidence</th>
                <th className="px-2 py-2">Fill %</th>
                <th className="px-2 py-2">Travel $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {snapshot.recommendations.slice(0, 20).map((row) => (
                <tr
                  key={row.opportunityId}
                  className="cursor-pointer hover:bg-zinc-800/40"
                  onClick={() => setSelectedRec(row)}
                >
                  <td className="px-2 py-2">{row.projectName}</td>
                  <td className="px-2 py-2">{row.bestRep?.repName ?? "—"}</td>
                  <td className="px-2 py-2">{row.confidenceScore}%</td>
                  <td className="px-2 py-2">{row.fillProbability}%</td>
                  <td className="px-2 py-2">${row.bestRep?.estimatedTravelCostUsd ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
