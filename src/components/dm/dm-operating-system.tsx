"use client";

import { CommandCenterDetailDrawer } from "@/components/recruiting/command-center-detail-drawer";
import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type { UserPublic } from "@/lib/auth/types";
import type {
  DmHeatMapHealthStatus,
  DmOperatingSystemSnapshot,
  DmRecruiterPerformanceTier,
} from "@/lib/dm-operating-system";
import { filterHeatMapStores } from "@/lib/dm-operating-system";
import type { CommandCenterDrawerContext } from "@/lib/unified-recruiting-command-center";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
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
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type DmOperatingSystemResponse = {
  ok?: boolean;
  snapshot?: DmOperatingSystemSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
    scopedToTerritory?: boolean;
  };
  error?: string;
};

type DmOperatingSystemProps = {
  user: UserPublic;
};

const HEALTH_STYLES: Record<DmHeatMapHealthStatus, string> = {
  healthy: UI_RISK.healthy,
  "at-risk": UI_RISK.atRisk,
  critical: UI_RISK.critical,
  "zero-pipeline": "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-100",
};

const TIER_STYLES: Record<DmRecruiterPerformanceTier, string> = {
  top: UI_BADGE.healthy,
  average: UI_BADGE.moderate,
  "needs-support": UI_BADGE.critical,
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

export function DmOperatingSystem({ user }: DmOperatingSystemProps) {
  const [snapshot, setSnapshot] = useState<DmOperatingSystemSnapshot | null>(null);
  const [meta, setMeta] = useState<DmOperatingSystemResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [drawerContext, setDrawerContext] = useState<CommandCenterDrawerContext | null>(null);
  const [heatMapProject, setHeatMapProject] = useState("");
  const [heatMapRecruiter, setHeatMapRecruiter] = useState("");
  const [heatMapState, setHeatMapState] = useState("");
  const [heatMapRisk, setHeatMapRisk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/dm-operating-system", {
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const payload = (await response.json()) as DmOperatingSystemResponse;
      if (!response.ok || !payload.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "Failed to load DM operating system");
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

  const filteredHeatMap = useMemo(() => {
    if (!snapshot) return [];
    return filterHeatMapStores(snapshot.heatMap.stores, {
      project: heatMapProject || undefined,
      recruiter: heatMapRecruiter || undefined,
      state: heatMapState || undefined,
      riskLevel: heatMapRisk ? (heatMapRisk as DmOperatingSystemSnapshot["heatMap"]["filters"]["riskLevels"][number]) : undefined,
    });
  }, [snapshot, heatMapProject, heatMapRecruiter, heatMapState, heatMapRisk]);

  const openQueueItem = useCallback(
    (queueId: string) => {
      if (!snapshot) return;
      setSelectedQueueId(queueId);
      setDrawerContext(snapshot.drawerContextsByQueueId[queueId] ?? null);
    },
    [snapshot],
  );

  const dataTrust = {
    hasData: Boolean(snapshot),
    partialSync: meta?.partialSync ?? false,
    error,
  };

  const territoryLabel =
    snapshot?.scope.territoryLabel ??
    (user.territoryStates.join(", ") || "—");

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot)}
      loadingMessage="Loading DM operating system…"
      emptyTitle="No territory data yet"
      emptyMessage="DM workspace will populate after the next intelligence sync."
      emptyNextStep="Try refresh, or confirm Breezy and MEL integrations are healthy."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(snapshot)}
    >
      {snapshot ? (
        <div id="dm-operating-system" className={UI_SPACE.page}>
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>{user.name} · District Manager Operating System</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Execution workspace for {territoryLabel} · fill stores · manage recruiters · hit coverage targets
              </p>
            </div>
            <div className={UI_LAYOUT.toolbar}>
              <DataTrustBadge trust={dataTrust} />
              {meta?.intelligenceCache ? (
                <span className="rounded-full border border-zinc-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Intel cache · {meta.intelligenceCache.cacheStatus}
                </span>
              ) : null}
              <button type="button" onClick={() => void load()} className={UI_BUTTON.primary}>
                Refresh
              </button>
            </div>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            <KpiCard label="Territory Coverage" value={snapshot.kpis.territoryCoveragePercent} suffix="%" />
            <KpiCard label="Open Calls" value={snapshot.kpis.openCalls} />
            <KpiCard label="Stores At Risk" value={snapshot.kpis.storesAtRisk} />
            <KpiCard label="Zero Pipeline Stores" value={snapshot.kpis.zeroPipelineStores} />
            <KpiCard label="Recruiter Activity" value={snapshot.kpis.recruiterActivity} />
            <KpiCard label="Hiring Velocity" value={snapshot.kpis.hiringVelocity} suffix="/7d" />
            <KpiCard label="Territory Risk Score" value={snapshot.kpis.territoryRiskScore} />
          </section>

          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard title="DM Action Queue" subtitle="Territory-scoped actions prioritized by impact">
              {snapshot.actionQueue.length === 0 ? (
                <p className="text-sm text-zinc-500">No actions in queue.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.actionQueue.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openQueueItem(item.id)}
                      className="flex w-full items-start justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-left hover:border-teal-500/30"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-50">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{item.subtitle}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold uppercase text-zinc-400">
                        {item.priority}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="DM Daily Plan" subtitle="Top 10 territory actions for today">
              {snapshot.dailyPlan.length === 0 ? (
                <p className="text-sm text-zinc-500">No daily actions planned.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.dailyPlan.map((action) => (
                    <div
                      key={action.id}
                      className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-zinc-50">
                        #{action.rank} {action.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">{action.whyItMatters}</p>
                      <p className="mt-1 text-xs text-teal-300/90">{action.expectedImpact}</p>
                      <p className="mt-1 text-xs text-zinc-500">Next: {action.recommendedNextStep}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Escalation Center" subtitle="Items needing executive attention or resources">
              {snapshot.escalationCenter.length === 0 ? (
                <p className="text-sm text-zinc-500">No escalations pending.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.escalationCenter.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
                        {item.category.replace(/-/g, " ")}
                      </p>
                      <p className="mt-1 text-sm font-medium text-zinc-50">{item.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Territory Heat Map" subtitle="Store health across your territory">
            <div className="mb-3 flex flex-wrap gap-2">
              <select
                value={heatMapProject}
                onChange={(event) => setHeatMapProject(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
              >
                <option value="">All projects</option>
                {snapshot.heatMap.filters.projects.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
              <select
                value={heatMapRecruiter}
                onChange={(event) => setHeatMapRecruiter(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
              >
                <option value="">All recruiters</option>
                {snapshot.heatMap.filters.recruiters.map((recruiter) => (
                  <option key={recruiter} value={recruiter}>
                    {recruiter}
                  </option>
                ))}
              </select>
              <select
                value={heatMapState}
                onChange={(event) => setHeatMapState(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
              >
                <option value="">All states</option>
                {snapshot.heatMap.filters.states.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <select
                value={heatMapRisk}
                onChange={(event) => setHeatMapRisk(event.target.value)}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
              >
                <option value="">All risk levels</option>
                {snapshot.heatMap.filters.riskLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            {filteredHeatMap.length === 0 ? (
              <p className="text-sm text-zinc-500">No stores match the selected filters.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {filteredHeatMap.slice(0, 18).map((store) => (
                  <div
                    key={store.id}
                    className={`rounded-lg border px-3 py-2 ${HEALTH_STYLES[store.healthStatus]}`}
                  >
                    <p className="text-sm font-medium">{store.storeName}</p>
                    <p className="text-xs opacity-80">
                      {store.projectName} · {store.state}
                    </p>
                    <p className="mt-1 text-xs">
                      {store.coveragePercent}% coverage · {store.openCalls} open calls · pipeline{" "}
                      {store.pipelineDepth}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Recruiter Performance" subtitle="Pipeline, follow-ups, and coverage contribution">
              {snapshot.recruiterPerformance.recruiters.length === 0 ? (
                <p className="text-sm text-zinc-500">No recruiter activity in territory.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.recruiterPerformance.topPerformers.length > 0 ? (
                    <p className="text-xs text-emerald-300">
                      Top performers: {snapshot.recruiterPerformance.topPerformers.join(", ")}
                    </p>
                  ) : null}
                  {snapshot.recruiterPerformance.needsSupport.length > 0 ? (
                    <p className="text-xs text-amber-300">
                      Needs support: {snapshot.recruiterPerformance.needsSupport.join(", ")}
                    </p>
                  ) : null}
                  {snapshot.recruiterPerformance.recruiters.slice(0, 8).map((row) => (
                    <div
                      key={row.recruiter}
                      className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-50">{row.recruiter}</p>
                        <p className="text-xs text-zinc-400">
                          {row.openReqs} reqs · {row.candidatePipeline} pipeline ·{" "}
                          {row.followUpCompletionPercent}% follow-ups · {row.hiringVelocity} hires/7d
                        </p>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${TIER_STYLES[row.performanceTier]}`}>
                        {row.performanceTier.replace(/-/g, " ")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Territory Forecast" subtitle="Coverage, completion, and risk trend outlook">
              <div className="grid gap-2 sm:grid-cols-3">
                {snapshot.forecast.map((row) => (
                  <div
                    key={row.horizon}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {row.horizon}
                    </p>
                    <p className="mt-1 text-sm text-zinc-50">{row.coveragePercent}% coverage</p>
                    <p className="text-xs text-zinc-400">{row.completionPercent}% completion</p>
                    <p className="text-xs text-zinc-400">−{row.openCallReduction} open calls</p>
                    <p className="mt-1 text-xs capitalize text-teal-300/90">Risk {row.riskTrend}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <p className="text-xs text-zinc-600">
            Snapshot {new Date(snapshot.generatedAt).toLocaleString()} · plan date {snapshot.planDate}
            {meta?.scopedToTerritory === false ? " · admin unscoped view" : ""}
          </p>

          <CommandCenterDetailDrawer
            open={Boolean(selectedQueueId && drawerContext)}
            onClose={() => {
              setSelectedQueueId(null);
              setDrawerContext(null);
            }}
            context={drawerContext}
            onStatusChange={async () => {
              await load();
            }}
          />
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
