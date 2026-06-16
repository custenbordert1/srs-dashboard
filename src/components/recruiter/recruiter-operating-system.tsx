"use client";

import { CommandCenterDetailDrawer } from "@/components/recruiting/command-center-detail-drawer";
import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type { UserPublic } from "@/lib/auth/types";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import type {
  RecruiterCandidateHeat,
  RecruiterOperatingSystemSnapshot,
} from "@/lib/recruiter-operating-system";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import type { CommandCenterDrawerContext } from "@/lib/unified-recruiting-command-center";
import {
  UI_BADGE,
  UI_BUTTON,
  UI_LAYOUT,
  UI_RISK,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type RecruiterOperatingSystemResponse = {
  ok?: boolean;
  snapshot?: RecruiterOperatingSystemSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
    scopedToRecruiter?: boolean;
  };
  error?: string;
};

type RecruiterOperatingSystemProps = {
  user?: UserPublic;
};

const HEAT_STYLES: Record<RecruiterCandidateHeat, string> = {
  hot: UI_RISK.critical,
  warm: UI_RISK.atRisk,
  cold: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  "at-risk": UI_BADGE.critical,
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

export function RecruiterOperatingSystem({ user }: RecruiterOperatingSystemProps) {
  const [snapshot, setSnapshot] = useState<RecruiterOperatingSystemSnapshot | null>(null);
  const [meta, setMeta] = useState<RecruiterOperatingSystemResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [drawerContext, setDrawerContext] = useState<CommandCenterDrawerContext | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/recruiter-operating-system", {
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const payload = (await response.json()) as RecruiterOperatingSystemResponse;
      if (!response.ok || !payload.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "Failed to load recruiter operating system");
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

  const recruiterLabel = snapshot?.scope.recruiterLabel ?? user?.name ?? "Recruiter";

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot)}
      loadingMessage="Loading recruiter operating system…"
      emptyTitle="No recruiter data yet"
      emptyMessage="Your workspace will populate after the next intelligence sync."
      emptyNextStep="Try refresh, or confirm Breezy and MEL integrations are healthy."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(snapshot)}
    >
      {snapshot ? (
        <div id="recruiter-operating-system" className={UI_SPACE.page}>
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>{recruiterLabel} · Recruiter Operating System</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Prioritized actions to maximize hires, coverage, and project completion
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
            <KpiCard label="Assigned Open Calls" value={snapshot.kpis.assignedOpenCalls} />
            <KpiCard label="Active Candidates" value={snapshot.kpis.activeCandidates} />
            <KpiCard label="Needs Follow-Up" value={snapshot.kpis.candidatesRequiringFollowUp} />
            <KpiCard label="Ready For Placement" value={snapshot.kpis.readyForPlacementCandidates} />
            <KpiCard label="Interviews Scheduled" value={snapshot.kpis.interviewsScheduled} />
            <KpiCard label="Coverage Impact" value={snapshot.kpis.territoryCoverageImpact} suffix="%" />
            <KpiCard label="Productivity Score" value={snapshot.kpis.recruiterProductivityScore} />
          </section>

          <div className="grid gap-4 xl:grid-cols-3">
            <SectionCard title="Action Queue" subtitle="Prioritized recruiting work">
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
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                          {item.category.replace(/-/g, " ")} · score {item.priorityScore}
                        </p>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold uppercase text-zinc-400">
                        {item.priority}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Daily Plan" subtitle="Top 25 recruiting actions for today">
              {snapshot.dailyPlan.length === 0 ? (
                <p className="text-sm text-zinc-500">No daily actions planned.</p>
              ) : (
                <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                  {snapshot.dailyPlan.map((action) => (
                    <div
                      key={action.id}
                      className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-zinc-50">
                        #{action.rank} {action.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">{action.reason}</p>
                      <p className="mt-1 text-xs text-teal-300/90">{action.expectedImpact}</p>
                      <p className="mt-1 text-xs text-zinc-500">Next: {action.recommendedNextStep}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Recommendations" subtitle="Impact-ranked next moves">
              {snapshot.recommendations.length === 0 ? (
                <p className="text-sm text-zinc-500">No recommendations available.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.recommendations.slice(0, 8).map((rec) => (
                    <div
                      key={rec.id}
                      className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-3 py-2"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-200/80">
                        {rec.kind.replace(/-/g, " ")}
                      </p>
                      <p className="mt-1 text-sm font-medium text-zinc-50">{rec.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">{rec.detail}</p>
                      <p className="mt-1 text-xs text-zinc-500">{rec.expectedResult}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Candidate Priorities" subtitle="Hot, warm, cold, and at-risk ranking">
              <div className="space-y-2">
                {snapshot.candidatePriorities.slice(0, 15).map((row) => (
                  <div
                    key={row.candidateId}
                    className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-50">{row.candidateName}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {row.workflowStatus} · {row.city}, {row.state}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{row.recommendedNextAction}</p>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {row.outreachMethod} · {row.recommendedTiming}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${HEAT_STYLES[row.heat]}`}>
                      {row.heat}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Re-Engagement Center" subtitle="Stalled, abandoned, and return-eligible candidates">
              <div className="space-y-2">
                {snapshot.reEngagementCenter.length === 0 ? (
                  <p className="text-sm text-zinc-500">No re-engagement opportunities.</p>
                ) : (
                  snapshot.reEngagementCenter.slice(0, 12).map((row) => (
                    <div
                      key={row.candidateId}
                      className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2"
                    >
                      <p className="text-sm font-medium text-zinc-50">{row.candidateName}</p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {row.segment.replace(/-/g, " ")} · {row.city}, {row.state}
                      </p>
                      <p className="mt-1 text-xs text-amber-200/90">
                        Opportunity {row.opportunityScore} · placement {row.placementLikelihood}% · territory {row.territoryImpact}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{row.recommendedAction}</p>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Pipeline Health" subtitle="Stages, aging, and bottlenecks">
              <div className="space-y-2">
                {snapshot.pipelineHealth.stages.map((stage) => (
                  <div
                    key={stage.stage}
                    className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-zinc-100">{stage.stage}</p>
                      <p className="text-xs text-zinc-500">
                        {stage.stuckCount} stuck · {stage.followUpGapCount} follow-up gaps · avg {stage.avgDaysInStage}d
                      </p>
                    </div>
                    <span className="tabular-nums text-zinc-300">{stage.count}</span>
                  </div>
                ))}
              </div>
              {snapshot.pipelineHealth.bottlenecks.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Bottlenecks</p>
                  {snapshot.pipelineHealth.bottlenecks.map((bottleneck) => (
                    <div
                      key={bottleneck.id}
                      className="rounded-lg border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs text-zinc-300"
                    >
                      <span className="font-semibold uppercase text-red-200/90">{bottleneck.severity}</span>
                      {" · "}
                      {bottleneck.detail}
                    </div>
                  ))}
                </div>
              ) : null}
            </SectionCard>

            <SectionCard title="Productivity Metrics" subtitle="7 / 30 / 90 day trends">
              <div className="grid gap-2 sm:grid-cols-3">
                {snapshot.productivityMetrics.map((trend) => (
                  <div
                    key={trend.horizon}
                    className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{trend.horizon}</p>
                    <dl className="mt-2 space-y-1 text-xs text-zinc-300">
                      <div className="flex justify-between gap-2">
                        <dt>Calls</dt>
                        <dd className="tabular-nums">{trend.callsCompleted}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Follow-ups</dt>
                        <dd className="tabular-nums">{trend.followUpsCompleted}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Moved forward</dt>
                        <dd className="tabular-nums">{trend.candidatesMovedForward}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Placements</dt>
                        <dd className="tabular-nums">{trend.placementsInfluenced}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Coverage</dt>
                        <dd className="tabular-nums">{trend.coverageContribution}%</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <CommandCenterDetailDrawer
            open={Boolean(selectedQueueId)}
            onClose={() => {
              setSelectedQueueId(null);
              setDrawerContext(null);
            }}
            context={drawerContext}
          />
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
