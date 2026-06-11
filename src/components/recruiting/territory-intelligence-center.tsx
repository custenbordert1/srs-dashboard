"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { buildDataTrustState } from "@/lib/data-trust-state";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type {
  CoverageHealthTier,
  TerritoryIntelligenceCenterSnapshot,
  TerritoryIntelligenceTerritoryRow,
  TerritoryRecommendation,
} from "@/lib/territory-intelligence";
import { useCallback, useEffect, useMemo, useState } from "react";

type IntelligenceResponse = {
  ok?: boolean;
  center?: TerritoryIntelligenceCenterSnapshot;
  meta?: {
    partialSync?: boolean;
    scanMode?: string;
    positionsScanned?: number;
    totalPositionsAvailable?: number;
    hasCoverageData?: boolean;
    refreshedAt?: string;
  };
  error?: string;
};

const HEAT_TIER_STYLES: Record<CoverageHealthTier, string> = {
  green: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
  yellow: "border-amber-500/40 bg-amber-500/15 text-amber-100",
  red: "border-red-500/40 bg-red-500/15 text-red-100",
};

const HEAT_TIER_LABEL: Record<CoverageHealthTier, string> = {
  green: "Healthy",
  yellow: "Warning",
  red: "Critical",
};

const REC_SEVERITY_STYLES: Record<TerritoryRecommendation["severity"], string> = {
  critical: "border-red-500/30 bg-red-500/10 text-red-100",
  high: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  medium: "border-sky-500/30 bg-sky-500/10 text-sky-100",
};

function velocityLabel(direction: TerritoryIntelligenceTerritoryRow["metrics"]["applicantVelocity"]["direction"]) {
  if (direction === "up") return "↑ Rising";
  if (direction === "down") return "↓ Declining";
  return "→ Flat";
}

function TerritoryRollupTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: TerritoryIntelligenceTerritoryRow[];
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h3 className="text-base font-semibold text-zinc-50">{title}</h3>
      <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-2 py-2 font-medium">DM</th>
              <th className="px-2 py-2 font-medium">Coverage</th>
              <th className="px-2 py-2 font-medium">Risk</th>
              <th className="px-2 py-2 font-medium">Zero-app jobs</th>
              <th className="px-2 py-2 font-medium">Hires 7d</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
            {rows.map((row) => (
              <tr key={row.dmName}>
                <td className="px-2 py-2 font-medium">{row.dmName}</td>
                <td className="px-2 py-2">{row.metrics.coveragePercent}%</td>
                <td className="px-2 py-2">{row.metrics.coverageRiskScore}/100</td>
                <td className="px-2 py-2">{row.metrics.zeroApplicantJobs}</td>
                <td className="px-2 py-2">{row.metrics.hiresLast7Days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TerritoryIntelligenceCenter() {
  const [center, setCenter] = useState<TerritoryIntelligenceCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<IntelligenceResponse["meta"]>();
  const [selectedDm, setSelectedDm] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/territory-intelligence", {
        timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
      });
      const parsed = (await res.json()) as IntelligenceResponse;
      if (!parsed.ok || !parsed.center) {
        setError(parsed.error ?? "Unable to load territory intelligence.");
        return;
      }
      setCenter(parsed.center);
      setMeta(parsed.meta);
      setSelectedDm((current) => current || parsed.center!.territories[0]?.dmName || "");
    } catch {
      setError("Unable to load territory intelligence.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const trustInput = useMemo(
    () => ({
      hasData: Boolean(center),
      partialSync: meta?.partialSync,
      scanMode: meta?.scanMode,
      positionsScanned: meta?.positionsScanned,
      totalPositionsAvailable: meta?.totalPositionsAvailable,
    }),
    [center, meta],
  );
  const trustState = useMemo(() => buildDataTrustState(trustInput), [trustInput]);

  const selectedTerritory = useMemo(
    () => center?.territories.find((row) => row.dmName === selectedDm) ?? null,
    [center, selectedDm],
  );

  const allRecommendations = useMemo(() => {
    if (!center) return [];
    return center.territories
      .flatMap((row) => row.recommendations)
      .sort((a, b) => {
        const rank = { critical: 0, high: 1, medium: 2 };
        return rank[a.severity] - rank[b.severity];
      })
      .slice(0, 12);
  }, [center]);

  if (loading && !center) {
    return <p className="text-sm text-zinc-500">Loading territory intelligence center…</p>;
  }

  if (error && !center) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (!center) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Territory intelligence center</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Per-DM coverage, applicant flow, recruiter workload, and heat map signals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataTrustBadge trust={trustInput} state={trustState} />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TerritoryRollupTable
          title="Top 10 highest-risk territories"
          subtitle="Ranked by attention score, coverage risk, and zero-applicant jobs"
          rows={center.executiveRollup.highestRiskTerritories}
        />
        <TerritoryRollupTable
          title="Top 10 healthiest territories"
          subtitle="Ranked by coverage percent and low coverage risk"
          rows={center.executiveRollup.healthiestTerritories}
        />
      </div>

      {allRecommendations.length > 0 ? (
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-zinc-50">Recommendations</h3>
          <ul className="mt-3 space-y-2">
            {allRecommendations.map((rec) => (
              <li
                key={rec.id}
                className={`rounded-lg border px-3 py-2 text-sm ${REC_SEVERITY_STYLES[rec.severity]}`}
              >
                <span className="font-medium">{rec.dmName}</span>
                <span className="text-zinc-400"> — </span>
                {rec.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-zinc-50">Territory heat map</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Green = healthy · Yellow = warning · Red = critical
            </p>
          </div>
          <label className="text-xs text-zinc-400">
            DM territory
            <select
              value={selectedDm}
              onChange={(e) => setSelectedDm(e.target.value)}
              className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
            >
              {center.territories.map((row) => (
                <option key={row.dmName} value={row.dmName}>
                  {row.dmName}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedTerritory ? (
          <>
            <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Open calls", value: selectedTerritory.metrics.openCalls },
                { label: "Active reps", value: selectedTerritory.metrics.activeReps },
                { label: "Coverage", value: `${selectedTerritory.metrics.coveragePercent}%` },
                { label: "Zero-app jobs", value: selectedTerritory.metrics.zeroApplicantJobs },
                { label: "Low-flow jobs", value: selectedTerritory.metrics.lowApplicantFlowJobs },
                { label: "Coverage risk", value: `${selectedTerritory.metrics.coverageRiskScore}/100` },
                { label: "Recruiter workload", value: `${selectedTerritory.metrics.recruiterWorkloadScore}/100` },
                { label: "Hires (7d)", value: selectedTerritory.metrics.hiresLast7Days },
                {
                  label: "Applicant velocity",
                  value: velocityLabel(selectedTerritory.metrics.applicantVelocity.direction),
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2"
                >
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">{kpi.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-zinc-100">{kpi.value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedTerritory.heatMap.map((cell) => (
                <div
                  key={cell.id}
                  className={`min-w-[7rem] rounded-lg border px-3 py-2 text-center text-xs ${HEAT_TIER_STYLES[cell.tier]}`}
                  title={`${cell.openJobs} open jobs · ${cell.zeroApplicantJobs} zero-applicant`}
                >
                  <p className="font-semibold">{cell.label}</p>
                  <p className="mt-0.5 opacity-80">{HEAT_TIER_LABEL[cell.tier]}</p>
                  <p className="mt-1 text-[10px] opacity-70">
                    {cell.openJobs} jobs · {cell.zeroApplicantJobs} empty
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">All territories</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2 font-medium">DM</th>
                <th className="px-2 py-2 font-medium">Open calls</th>
                <th className="px-2 py-2 font-medium">Active reps</th>
                <th className="px-2 py-2 font-medium">Coverage</th>
                <th className="px-2 py-2 font-medium">Zero-app</th>
                <th className="px-2 py-2 font-medium">Low flow</th>
                <th className="px-2 py-2 font-medium">Risk</th>
                <th className="px-2 py-2 font-medium">Workload</th>
                <th className="px-2 py-2 font-medium">Hires 7d</th>
                <th className="px-2 py-2 font-medium">Velocity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {center.territories.map((row) => (
                <tr key={row.dmName}>
                  <td className="px-2 py-2 font-medium">{row.dmName}</td>
                  <td className="px-2 py-2">{row.metrics.openCalls}</td>
                  <td className="px-2 py-2">{row.metrics.activeReps}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${HEAT_TIER_STYLES[row.metrics.coverageTier]}`}
                    >
                      {row.metrics.coveragePercent}%
                    </span>
                  </td>
                  <td className="px-2 py-2">{row.metrics.zeroApplicantJobs}</td>
                  <td className="px-2 py-2">{row.metrics.lowApplicantFlowJobs}</td>
                  <td className="px-2 py-2">{row.metrics.coverageRiskScore}</td>
                  <td className="px-2 py-2">{row.metrics.recruiterWorkloadScore}</td>
                  <td className="px-2 py-2">{row.metrics.hiresLast7Days}</td>
                  <td className="px-2 py-2">
                    {velocityLabel(row.metrics.applicantVelocity.direction)} (
                    {row.metrics.applicantVelocity.delta >= 0 ? "+" : ""}
                    {row.metrics.applicantVelocity.delta})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {meta?.refreshedAt ? (
        <p className="text-xs text-zinc-600">
          Refreshed {new Date(meta.refreshedAt).toLocaleString()}
          {meta.hasCoverageData === false ? " · MEL coverage data unavailable" : ""}
        </p>
      ) : null}
    </div>
  );
}
