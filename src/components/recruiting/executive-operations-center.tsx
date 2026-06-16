"use client";

import { CommandCenterDetailDrawer } from "@/components/recruiting/command-center-detail-drawer";
import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type { ExecutiveAlertAssigneeOptions } from "@/lib/alerts/build-executive-alert-assignees";
import {
  EXECUTIVE_ALERT_STATUS_LABELS,
  FOLLOW_UP_PRIORITY_LABELS,
  type ExecutiveAlertStatus,
} from "@/lib/alerts/executive-alert-status-types";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import type {
  CommandCenterDrawerContext,
  CommandCenterWorkQueueItem,
  UnifiedRecruitingCommandCenterSnapshot,
} from "@/lib/unified-recruiting-command-center";
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

type CommandCenterResponse = {
  ok?: boolean;
  snapshot?: UnifiedRecruitingCommandCenterSnapshot;
  assigneeOptions?: ExecutiveAlertAssigneeOptions;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
  };
  error?: string;
};

const PRIORITY_BADGE: Record<CommandCenterWorkQueueItem["priority"], string> = {
  critical: UI_BADGE.critical,
  high: UI_BADGE.high,
  medium: UI_BADGE.moderate,
  low: UI_BADGE.healthy,
};

const TYPE_LABELS: Record<CommandCenterWorkQueueItem["type"], string> = {
  alert: "Alert",
  recommendation: "Recommendation",
  "follow-up": "Follow-up",
  "daily-action": "Daily action",
};

const RISK_LEVEL_STYLES: Record<string, string> = {
  critical: UI_RISK.critical,
  high: UI_RISK.atRisk,
  moderate: UI_RISK.stable,
  stable: UI_RISK.healthy,
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

function ListButton({
  title,
  subtitle,
  badge,
  onClick,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-left hover:border-teal-500/30"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-50">{title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{subtitle}</p>
      </div>
      {badge ? (
        <span className="shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-400">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function ExecutiveOperationsCenter() {
  const [snapshot, setSnapshot] = useState<UnifiedRecruitingCommandCenterSnapshot | null>(null);
  const [meta, setMeta] = useState<CommandCenterResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [drawerContext, setDrawerContext] = useState<CommandCenterDrawerContext | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/unified-recruiting-command-center", {
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const payload = (await response.json()) as CommandCenterResponse;
      if (!response.ok || !payload.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "Failed to load unified recruiting command center");
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

  const updateAlertStatus = useCallback(
    async (alertId: string, status: ExecutiveAlertStatus) => {
      try {
        await fetchWithTimeout("/api/executive-alerts/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId, status }),
          timeoutMs: FETCH_T4_INTELLIGENCE_MS,
        });
        await load();
      } catch {
        // Keep drawer open; user can retry refresh.
      }
    },
    [load],
  );

  const dataTrust = {
    hasData: Boolean(snapshot),
    partialSync: meta?.partialSync ?? false,
    error,
  };

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot)}
      loadingMessage="Loading unified command center…"
      emptyTitle="No command center data yet"
      emptyMessage="Executive operations will appear after the next successful sync."
      emptyNextStep="Try refresh, or confirm Breezy and MEL integrations are healthy in Admin."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(snapshot)}
    >
      {snapshot ? (
        <div id="executive-operations-center" className={UI_SPACE.page}>
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Unified Recruiting Command Center</h2>
              <p className={UI_TYPE.pageSubtitle}>
                One screen for alerts, risk, recommendations, follow-ups, and daily actions.
              </p>
            </div>
            <div className={UI_LAYOUT.toolbar}>
              <DataTrustBadge trust={dataTrust} />
              {meta?.intelligenceCache ? (
                <span className="rounded-full border border-zinc-700/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Intel cache · {meta.intelligenceCache.cacheStatus} ·{" "}
                  {Math.round(meta.intelligenceCache.snapshotAgeMs / 1000)}s
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => navigateRecruitingTab({ tab: "executive-alerts" })}
                className={UI_BUTTON.ghost}
              >
                Alerts
              </button>
              <button
                type="button"
                onClick={() => navigateRecruitingTab({ tab: "daily-action-plan" })}
                className={UI_BUTTON.ghost}
              >
                Daily Plan
              </button>
              <button type="button" onClick={() => void load()} className={UI_BUTTON.primary}>
                Refresh
              </button>
            </div>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            <KpiCard label="Open Calls" value={snapshot.kpis.openCalls} />
            <KpiCard label="Critical Territories" value={snapshot.kpis.criticalTerritories} />
            <KpiCard label="Zero Pipeline Stores" value={snapshot.kpis.zeroPipelineStores} />
            <KpiCard label="Coverage" value={snapshot.kpis.coveragePercent} suffix="%" />
            <KpiCard label="Hiring Velocity" value={snapshot.kpis.hiringVelocity} suffix="/7d" />
            <KpiCard label="Predicted Coverage Gap" value={snapshot.kpis.predictedCoverageGap} suffix="%" />
            <KpiCard label="Actions Due Today" value={snapshot.kpis.actionsDueToday} />
          </section>

          <section className={`${UI_SURFACE.panel} border-teal-500/20 bg-teal-500/5 p-5`}>
            <h3 className={UI_TYPE.sectionTitle}>Today&apos;s Executive Briefing</h3>
            <p className="mt-1 text-sm font-medium text-teal-100">{snapshot.briefing.headline}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <BriefingList title="Top risks" items={snapshot.briefing.topRisks} />
              <BriefingList title="Top opportunities" items={snapshot.briefing.topOpportunities} />
              <BriefingList
                title="Territories needing attention"
                items={snapshot.briefing.territoriesNeedingAttention}
              />
              <BriefingList title="Recommended actions" items={snapshot.briefing.recommendedActions} />
              <BriefingList title="Expected outcomes" items={snapshot.briefing.expectedOutcomes} />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricPill label="Actions completed today" value={snapshot.productivityMetrics.actionsCompletedToday} />
            <MetricPill label="Follow-ups resolved" value={snapshot.productivityMetrics.followUpsResolved} />
            <MetricPill label="Risk reduction" value={snapshot.productivityMetrics.riskReductionAchieved} />
            <MetricPill label="Coverage gained" value={`+${snapshot.productivityMetrics.coverageGained}%`} />
            <MetricPill label="Hires influenced" value={snapshot.productivityMetrics.hiresInfluenced} />
          </section>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4">
              <SectionCard title="Critical Alerts" subtitle="Highest-severity intelligence alerts">
                {snapshot.leftColumn.criticalAlerts.length === 0 ? (
                  <p className="text-sm text-zinc-500">No critical alerts.</p>
                ) : (
                  <div className="space-y-2">
                    {snapshot.leftColumn.criticalAlerts.map((alert) => (
                      <ListButton
                        key={alert.id}
                        title={alert.title}
                        subtitle={alert.description}
                        badge={alert.severity}
                        onClick={() => openQueueItem(`alert:${alert.id}`)}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Today&apos;s Actions" subtitle="Must-do daily action plan">
                {snapshot.leftColumn.todaysActions.length === 0 ? (
                  <p className="text-sm text-zinc-500">No actions queued for today.</p>
                ) : (
                  <div className="space-y-2">
                    {snapshot.leftColumn.todaysActions.map((action) => (
                      <ListButton
                        key={action.id}
                        title={action.title}
                        subtitle={action.reasoning}
                        badge={action.bucket}
                        onClick={() => openQueueItem(`daily-action:${action.id}`)}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Overdue Follow-Ups" subtitle="Assigned follow-ups past due">
                {snapshot.leftColumn.overdueFollowUps.length === 0 ? (
                  <p className="text-sm text-zinc-500">No overdue follow-ups.</p>
                ) : (
                  <div className="space-y-2">
                    {snapshot.leftColumn.overdueFollowUps.map((followUp) => (
                      <ListButton
                        key={followUp.id}
                        title={followUp.ownerName}
                        subtitle={followUp.notes ?? "Overdue executive follow-up"}
                        badge={followUp.priority}
                        onClick={() => openQueueItem(`follow-up:${followUp.id}`)}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <div className="space-y-4">
              <SectionCard title="Territory Risk Dashboard" subtitle="Highest-risk territories">
                <div className="space-y-2">
                  {snapshot.centerColumn.territoryRiskDashboard.map((row) => (
                    <div
                      key={row.entityId}
                      className={`rounded-lg border border-zinc-800/80 px-3 py-2 ${RISK_LEVEL_STYLES[row.riskLevel] ?? ""}`}
                    >
                      <p className="text-sm font-medium text-zinc-50">{row.label}</p>
                      <p className="text-xs text-zinc-400">
                        Risk {row.riskScore} · Coverage {row.coveragePercent}% · {row.trend}
                      </p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Coverage Forecast" subtitle="Predicted coverage misses">
                <ForecastList items={snapshot.centerColumn.coverageForecasts} />
              </SectionCard>

              <SectionCard title="Hiring Forecast" subtitle="Completion risk projections">
                <ForecastList items={snapshot.centerColumn.hiringForecasts} />
              </SectionCard>
            </div>

            <div className="space-y-4">
              <SectionCard title="Top Recommendations" subtitle="Autopilot highest-impact actions">
                <div className="space-y-2">
                  {snapshot.rightColumn.topRecommendations.map((recommendation) => (
                    <ListButton
                      key={recommendation.id}
                      title={recommendation.title}
                      subtitle={recommendation.reasoning}
                      badge={`ROI ${recommendation.opportunity.expectedRoiScore}`}
                      onClick={() => openQueueItem(`recommendation:${recommendation.id}`)}
                    />
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="DM Performance Watchlist" subtitle="Territories under pressure">
                <div className="space-y-2">
                  {snapshot.rightColumn.dmPerformanceWatchlist.map((row) => (
                    <div key={row.entityId} className="rounded-lg border border-zinc-800/80 px-3 py-2">
                      <p className="text-sm font-medium text-zinc-50">{row.dmName}</p>
                      <p className="text-xs text-zinc-400">
                        {row.states.join(", ")} · Open calls {row.openCalls} · Pipeline {row.pipelineDepth}
                      </p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Projects At Risk" subtitle="High and critical project risk">
                <div className="space-y-2">
                  {snapshot.rightColumn.projectsAtRisk.map((project) => (
                    <div key={project.entityId} className="rounded-lg border border-zinc-800/80 px-3 py-2">
                      <p className="text-sm font-medium text-zinc-50">{project.label}</p>
                      <p className="text-xs text-zinc-400">
                        {project.dmName} · Risk {project.riskScore} · Coverage {project.coveragePercent}%
                      </p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>

          <section className={UI_SPACE.section}>
            <div className={UI_LAYOUT.pageHeader}>
              <div>
                <h3 className={UI_TYPE.sectionTitle}>Operational Work Queue</h3>
                <p className={UI_TYPE.sectionSubtitle}>
                  Unified alerts, recommendations, follow-ups, and daily actions — sorted by impact.
                </p>
              </div>
            </div>
            {snapshot.workQueue.length === 0 ? (
              <WorkspaceEmptyState
                title="Work queue is clear"
                message="No open alerts, recommendations, follow-ups, or daily actions need attention."
              />
            ) : (
              <div className={UI_SURFACE.tableWrap}>
                <table className={UI_LAYOUT.responsiveTable}>
                  <thead className={UI_TYPE.tableHead}>
                    <tr>
                      <th className="px-3 py-2">Priority</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Territory</th>
                      <th className="px-3 py-2">Owner</th>
                      <th className="px-3 py-2">Due Date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Impact</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                    {snapshot.workQueue.map((item) => (
                      <tr
                        key={item.id}
                        className="cursor-pointer hover:bg-zinc-800/30"
                        onClick={() => openQueueItem(item.id)}
                      >
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_BADGE[item.priority]}`}
                          >
                            {FOLLOW_UP_PRIORITY_LABELS[item.priority]}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">{TYPE_LABELS[item.type]}</td>
                        <td className="px-3 py-2 text-xs">{item.territory}</td>
                        <td className="px-3 py-2 text-xs">{item.owner}</td>
                        <td className="px-3 py-2 text-xs">
                          {new Date(item.dueDate).toLocaleDateString()}
                          {item.isOverdue ? (
                            <span className="ml-1 text-red-300">overdue</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {item.status in EXECUTIVE_ALERT_STATUS_LABELS
                            ? EXECUTIVE_ALERT_STATUS_LABELS[item.status as ExecutiveAlertStatus]
                            : String(item.status)}
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold tabular-nums">{item.impactScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <CommandCenterDetailDrawer
            open={Boolean(selectedQueueId && drawerContext)}
            context={drawerContext}
            onClose={() => {
              setSelectedQueueId(null);
              setDrawerContext(null);
            }}
            onStatusChange={(alertId, status) => void updateAlertStatus(alertId, status)}
            onNavigate={() => {
              const alert = drawerContext?.alert;
              if (alert) {
                navigateRecruitingTab({
                  tab: alert.destination.tabId,
                  elementId: alert.destination.elementId,
                });
              } else if (drawerContext?.recommendation) {
                navigateRecruitingTab({
                  tab: drawerContext.recommendation.navigation.tabId,
                  elementId: drawerContext.recommendation.navigation.elementId,
                });
              } else if (drawerContext?.dailyAction) {
                navigateRecruitingTab({
                  tab: drawerContext.dailyAction.navigation.tabId,
                  elementId: drawerContext.dailyAction.navigation.elementId,
                });
              }
            }}
          />
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}

function BriefingList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">None flagged.</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-zinc-300">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-zinc-50">{value}</p>
    </div>
  );
}

function ForecastList({
  items,
}: {
  items: UnifiedRecruitingCommandCenterSnapshot["centerColumn"]["coverageForecasts"];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No forecasts in this category.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((forecast) => (
        <div key={forecast.id} className="rounded-lg border border-zinc-800/80 px-3 py-2">
          <p className="text-sm font-medium text-zinc-50">{forecast.label}</p>
          <p className="text-xs text-zinc-400">
            {forecast.dmName} · {forecast.confidence}% confidence
          </p>
          <p className="text-xs text-zinc-500">{forecast.reason}</p>
        </div>
      ))}
    </div>
  );
}
