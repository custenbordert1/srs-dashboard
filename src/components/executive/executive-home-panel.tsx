"use client";

import Link from "next/link";
import { AtsHealthCard } from "@/components/executive/ats-health-card";
import { RecruitingAlertsSection } from "@/components/recruiting/recruiting-alerts-section";
import type { ExecutiveDashboardSnapshot } from "@/lib/dm-dashboard";
import { useAtsHealth } from "@/hooks/use-ats-health";
import { useTerritoryDashboard } from "@/hooks/use-territory-dashboard";
import { useExecutiveAccountability } from "@/hooks/use-executive-accountability";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";

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

function KpiCard({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: string | number;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-zinc-800/80" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      )}
      {hint && !loading ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function TerritoryTable({
  title,
  rows,
  loading,
}: {
  title: string;
  rows: ExecutiveDashboardSnapshot["worstTerritories"];
  loading?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      {loading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-8 animate-pulse rounded bg-zinc-800/80" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No territory data.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">DM</th>
                <th className="pb-2 pr-3">Health</th>
                <th className="pb-2 pr-3">Jobs</th>
                <th className="pb-2">Candidates</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dmName} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.dmName}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">
                    {row.healthScore}{" "}
                    <span className="text-xs text-zinc-500">({row.healthLabel})</span>
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{row.activeJobs}</td>
                  <td className="py-2 text-zinc-400">{row.candidates}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ExecutiveHomePanel() {
  const { data, meta, loading, error, timedOut, refresh } =
    useTerritoryDashboard<ExecutiveDashboardSnapshot>({
      endpoint: "/api/executive/dashboard",
      pollIntervalMs: 0,
    });
  const accountability = useExecutiveAccountability();
  const atsHealth = useAtsHealth();
  const loadingCeilingHit = useLoadingCeiling(loading && !data, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  const insights = data?.executiveInsights;
  const kpiLoading = loading && !data && !atsHealth.snapshot;
  const atsFallback = atsHealth.snapshot;
  const openJobs = insights?.activeJobs ?? atsFallback?.jobsCached ?? 0;
  const totalCandidates = insights?.totalCandidates ?? atsFallback?.candidatesCached ?? 0;
  const activeRecruiters = insights?.activeRecruiters ?? 0;
  const fillRiskScore = insights?.fillRiskScore;
  const criticalTerritories = insights?.criticalTerritories ?? 0;
  const lastUpdated = meta?.refreshedAt ?? data?.fetchedAt ?? atsHealth.snapshot?.lastSuccessfulSync;
  const dataFreshness =
    atsHealth.snapshot?.dataFreshnessLabel ??
    (meta?.partialSync ? "Partial sync" : data ? "Current" : "Unknown");

  const overdueCount = accountability.snapshot?.statusSummary.overdue ?? 0;
  const openActions = accountability.snapshot?.statusSummary.open ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Executive Home</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Company-wide recruiting health, ATS reliability, territory risk, and accountability in one screen.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-400">
          <p>
            <span className="text-zinc-500">Last updated: </span>
            {kpiLoading ? "Loading…" : formatTimestamp(lastUpdated)}
          </p>
          <p className="mt-1">
            <span className="text-zinc-500">Data freshness: </span>
            {atsHealth.loading && !atsHealth.snapshot ? "Checking…" : dataFreshness}
          </p>
        </div>
      </header>

      {error && !data ? (
        <div
          role="status"
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          <p>
            {timedOut
              ? "Executive rollup is taking longer than expected. Retry or continue with ATS cache metrics below."
              : "Executive rollup is temporarily unavailable. Retry shortly."}
          </p>
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-2 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium hover:bg-amber-500/20"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loadingCeilingHit && !data ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Still loading executive rollup… KPIs will populate as soon as Breezy cache is ready.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Open jobs"
          value={openJobs.toLocaleString()}
          loading={kpiLoading}
        />
        <KpiCard
          label="Candidates"
          value={totalCandidates.toLocaleString()}
          loading={kpiLoading}
        />
        <KpiCard
          label="Active recruiters"
          value={activeRecruiters.toLocaleString()}
          loading={kpiLoading && !insights}
          hint="Assigned recruiters with pipeline activity"
        />
        <KpiCard
          label="Coverage risk"
          value={fillRiskScore !== undefined ? `${fillRiskScore}/100` : "—"}
          hint={insights?.fillRiskLabel ?? (data ? undefined : "Requires full rollup")}
          loading={kpiLoading && !insights}
        />
        <KpiCard
          label="Critical territories"
          value={criticalTerritories.toLocaleString()}
          loading={kpiLoading && !insights}
          hint="DM territories below health threshold"
        />
      </div>

      <AtsHealthCard compact />

      <div className="grid gap-6 lg:grid-cols-2">
        <TerritoryTable
          title="Top 10 risk territories"
          rows={data?.worstTerritories ?? []}
          loading={kpiLoading}
        />
        <TerritoryTable
          title="Top 10 healthy territories"
          rows={data?.bestTerritories ?? []}
          loading={kpiLoading}
        />
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-50">Executive alerts & accountability</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {accountability.loading && !accountability.snapshot
                ? "Loading accountability summary…"
                : `${openActions} open actions · ${overdueCount} overdue`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/?tab=executive-accountability&view=overdue"
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-100"
            >
              Overdue escalation
            </Link>
            <Link
              href="/?tab=executive-accountability"
              className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-100"
            >
              Accountability board
            </Link>
          </div>
        </div>
        <div className="mt-4">
          <RecruitingAlertsSection limit={6} />
        </div>
      </section>
    </div>
  );
}
