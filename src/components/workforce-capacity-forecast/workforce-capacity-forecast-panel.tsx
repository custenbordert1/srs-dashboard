"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import {
  UI_BUTTON,
  UI_LAYOUT,
  UI_RISK,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import type {
  RecruiterCapacityState,
  WorkforceCapacityForecastSnapshot,
} from "@/lib/workforce-capacity-forecast";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type ForecastResponse = {
  ok?: boolean;
  snapshot?: WorkforceCapacityForecastSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
    scopedToTerritory?: boolean;
    scopedToRecruiter?: boolean;
  };
  error?: string;
};

type WorkforceCapacityForecastPanelProps = {
  compact?: boolean;
  variant?: "executive" | "dm" | "recruiter" | "full";
};

const CAPACITY_STYLES: Record<RecruiterCapacityState, string> = {
  underutilized: UI_RISK.healthy,
  healthy: "border-teal-500/40 bg-teal-500/10 text-teal-100",
  busy: UI_RISK.atRisk,
  overloaded: UI_RISK.critical,
};

function KpiCard({ label, value, suffix }: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-50">
        {value}
        {suffix ? <span className="text-base font-medium text-zinc-400">{suffix}</span> : null}
      </p>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${UI_SURFACE.panel} border-zinc-800/80 bg-zinc-950/40 p-4`}>
      <div className="mb-3">
        <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
        {subtitle ? <p className={UI_TYPE.sectionSubtitle}>{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function WorkforceCapacityForecastPanel({
  compact = false,
  variant = "full",
}: WorkforceCapacityForecastPanelProps) {
  const [snapshot, setSnapshot] = useState<WorkforceCapacityForecastSnapshot | null>(null);
  const [meta, setMeta] = useState<ForecastResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/workforce-capacity-forecast", {
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const payload = (await response.json()) as ForecastResponse;
      if (!response.ok || !payload.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "Failed to load workforce capacity forecast");
      }
      setSnapshot(payload.snapshot);
      setMeta(payload.meta);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dataTrust = {
    hasData: Boolean(snapshot),
    partialSync: meta?.partialSync ?? false,
    error,
  };

  const showExecutive = variant === "executive" || variant === "full";
  const showDm = variant === "dm" || variant === "full";
  const showRecruiter = variant === "recruiter" || variant === "full";

  const content = snapshot ? (
    <div id="workforce-capacity-forecast" className={compact ? "space-y-3" : UI_SPACE.page}>
      {!compact ? (
        <div className={UI_LAYOUT.pageHeader}>
          <div>
            <h2 className={UI_TYPE.pageTitle}>Workforce Capacity & Hiring Forecast</h2>
            <p className={UI_TYPE.pageSubtitle}>
              Forecast hiring capacity, recruiter workload, DM workload, and staffing ability
            </p>
          </div>
          <div className={UI_LAYOUT.toolbar}>
            <DataTrustBadge trust={dataTrust} />
            {meta?.intelligenceCache ? (
              <span className="rounded-full border border-zinc-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                Intel cache · {meta.intelligenceCache.cacheStatus}
              </span>
            ) : null}
            <button type="button" onClick={() => void load()} className={UI_BUTTON.primary} disabled={loading}>
              Refresh
            </button>
          </div>
        </div>
      ) : null}

      {showExecutive ? (
        <SectionCard title="Next 30-Day Staffing Outlook" subtitle={snapshot.executiveOutlook.headline}>
          <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
            {snapshot.hiringForecast.map((point) => (
              <KpiCard
                key={point.horizon}
                label={`${point.horizon} hires`}
                value={`${point.confidenceLow}–${point.confidenceHigh}`}
              />
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <KpiCard
              label="Overloaded recruiters"
              value={snapshot.executiveOutlook.capacitySummary.overloadedRecruiters}
            />
            <KpiCard
              label="Spare capacity recruiters"
              value={snapshot.executiveOutlook.capacitySummary.underutilizedRecruiters}
            />
            <KpiCard label="DMs at risk" value={snapshot.executiveOutlook.capacitySummary.dmsAtRisk} />
          </div>
        </SectionCard>
      ) : null}

      {showRecruiter ? (
        <SectionCard title="Recruiter Capacity" subtitle="Workload, follow-ups, and open-call load">
          <div className="space-y-2">
            {snapshot.recruiterCapacity.slice(0, compact ? 5 : 12).map((row) => (
              <div
                key={row.recruiterName}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-50">{row.recruiterName}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {row.candidateVolume} candidates · {row.followUpVolume} follow-ups ·{" "}
                    {row.openCallLoad} open calls
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${CAPACITY_STYLES[row.state]}`}
                >
                  {row.capacityPercent}% · {row.state.replace(/-/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {showDm ? (
        <SectionCard title="DM Capacity" subtitle="Territory bench, risk load, and follow-up backlog">
          <div className="space-y-2">
            {snapshot.dmCapacity.slice(0, compact ? 4 : 10).map((row) => (
              <div
                key={row.dmName}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-50">{row.dmName}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {row.territoryCount} territories · {row.recruiterCount} recruiters ·{" "}
                    {row.openCalls} open calls · {row.followUpBacklog} overdue follow-ups
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    row.atRisk ? UI_RISK.critical : UI_RISK.healthy
                  }`}
                >
                  Score {row.capacityScore}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {showExecutive ? (
        <>
          <SectionCard title="Staffing Risks" subtitle="Highest-risk areas ranked">
            <div className="space-y-2">
              {snapshot.staffingRisks.slice(0, compact ? 5 : 10).map((risk) => (
                <div
                  key={risk.id}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-zinc-100">{risk.label}</p>
                    <span className="text-xs uppercase text-zinc-500">{risk.kind.replace(/-/g, " ")}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{risk.reason}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Resource Balancing" subtitle="Recommended moves with expected impact">
            <div className="space-y-2">
              {snapshot.resourceBalancing.slice(0, compact ? 3 : 5).map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-teal-50">{rec.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{rec.detail}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    +{rec.expectedHireGain} hires · +{rec.expectedCoverageGain}% coverage · −
                    {rec.expectedOpenCallReduction} open calls
                  </p>
                </div>
              ))}
            </div>
          </SectionCard>

          {!compact ? (
            <SectionCard title="Capacity Planning" subtitle="Who needs help and where spare capacity exists">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Recruiters needing help
                  </p>
                  <div className="space-y-1">
                    {snapshot.capacityPlanning.recruitersNeedingHelp.slice(0, 6).map((row) => (
                      <p key={row.recruiterName} className="text-sm text-zinc-300">
                        {row.recruiterName} · {row.capacityPercent}%
                      </p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Projects requiring staffing support
                  </p>
                  <div className="space-y-1">
                    {snapshot.capacityPlanning.projectsRequiringStaffingSupport.slice(0, 6).map((row) => (
                      <p key={row.projectId} className="text-sm text-zinc-300">
                        {row.projectName} · {row.openCalls} open calls · {row.coveragePercent}% coverage
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {!compact ? (
        <SectionCard title="Coverage Forecast" subtitle="Territory, DM, project, and company outlook">
          <div className="space-y-2">
            {snapshot.coverageForecasts.slice(0, 8).map((row) => {
              const thirtyDay = row.forecasts.find((point) => point.horizon === "30d");
              return (
                <div
                  key={row.entityId}
                  className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-zinc-100">
                      {row.label}{" "}
                      <span className="text-xs uppercase text-zinc-500">({row.scope})</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      Current {row.currentCoveragePercent}% · {row.currentOpenCalls} open calls
                    </p>
                  </div>
                  {thirtyDay ? (
                    <p className="text-xs text-teal-200/90">
                      30d: {thirtyDay.coveragePercent}% · −{thirtyDay.openCallReduction} calls
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : null}
    </div>
  ) : null;

  if (compact) {
    if (loading && !snapshot) {
      return <p className="text-sm text-zinc-500">Loading workforce capacity forecast…</p>;
    }
    if (error && !snapshot) {
      return <p className="text-sm text-red-300">{error}</p>;
    }
    return content;
  }

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot)}
      loadingMessage="Loading workforce capacity forecast…"
      emptyTitle="No capacity forecast data yet"
      emptyMessage="Forecasts will appear after the next successful intelligence sync."
      emptyNextStep="Try refresh, or confirm Breezy and MEL integrations are healthy."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(snapshot)}
    >
      {content}
    </WorkspacePageShell>
  );
}
