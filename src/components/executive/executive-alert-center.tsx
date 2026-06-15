"use client";

import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type {
  AlertCategory,
  AlertSeverity,
  ExecutiveAlert,
} from "@/lib/alerts/alert-types";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import { UI_BADGE, UI_BUTTON, UI_LAYOUT, UI_RISK, UI_SPACE, UI_SURFACE, UI_TYPE } from "@/lib/ui-tokens";
import { useCallback, useEffect, useMemo, useState } from "react";

type ExecutiveAlertsResponse = {
  ok?: boolean;
  error?: string;
  alerts?: ExecutiveAlert[];
  topActions?: ExecutiveAlert[];
  topCritical?: ExecutiveAlert[];
  criticalAlerts?: ExecutiveAlert[];
  highAlerts?: ExecutiveAlert[];
  generatedAt?: string;
  meta?: {
    totalCount: number;
    byCategory: Record<AlertCategory, number>;
    bySeverity: Record<AlertSeverity, number>;
    intelligenceCacheStatus?: string;
  };
  intelligenceCache?: RecruitingIntelligenceCacheMeta;
};

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  critical: UI_RISK.critical,
  high: UI_RISK.atRisk,
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  low: "border-zinc-700/80 bg-zinc-900/40 text-zinc-300",
};

const ACTION_LABELS: Record<ExecutiveAlert["recommendedAction"], string> = {
  "create-job-ad": "Create job ad",
  "assign-recruiter": "Assign recruiter",
  "notify-dm": "Notify DM",
  "territory-escalation": "Territory escalation",
  "placement-review": "Review placement",
  "candidate-followup": "Candidate follow-up",
  "paperwork-review": "Review paperwork",
};

function AlertCard({ alert, onNavigate }: { alert: ExecutiveAlert; onNavigate: (alert: ExecutiveAlert) => void }) {
  return (
    <article className={`rounded-xl border p-4 ${SEVERITY_STYLES[alert.severity]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.critical}`}>
              {alert.severity}
            </span>
            <span className="rounded bg-zinc-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
              {alert.category}
            </span>
            <span className="text-[10px] font-semibold tabular-nums text-zinc-300">
              Impact {alert.impactScore}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-zinc-50">{alert.title}</h3>
          <p className="text-sm text-zinc-300">{alert.description}</p>
          <p className="text-xs text-zinc-500">{alert.reason}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="rounded border border-zinc-700/80 bg-zinc-950/50 px-2 py-1 text-[10px] text-zinc-400">
            {ACTION_LABELS[alert.recommendedAction]}
          </span>
          <button type="button" className={UI_BUTTON.secondary} onClick={() => onNavigate(alert)}>
            Go to {alert.destination.label}
          </button>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-zinc-600">
        Automation ready · {alert.automationKind} · manual only
      </p>
    </article>
  );
}

function AlertSection({
  title,
  subtitle,
  alerts,
  emptyMessage,
  onNavigate,
}: {
  title: string;
  subtitle: string;
  alerts: ExecutiveAlert[];
  emptyMessage: string;
  onNavigate: (alert: ExecutiveAlert) => void;
}) {
  return (
    <section className={UI_SPACE.section}>
      <div>
        <h2 className={UI_TYPE.sectionTitle}>{title}</h2>
        <p className={UI_TYPE.sectionSubtitle}>{subtitle}</p>
      </div>
      {alerts.length === 0 ? (
        <WorkspaceEmptyState title={emptyMessage} message="No matching alerts in this section." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ExecutiveAlertCenter() {
  const [data, setData] = useState<ExecutiveAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const params = force ? "?forceRefresh=1" : "";
      const response = await fetchWithTimeout(`/api/executive-alerts${params}`, {
        cache: "no-store",
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const parsed = (await response.json()) as ExecutiveAlertsResponse;
      if (!response.ok || !parsed.ok) {
        throw new Error(parsed.error ?? "Failed to load executive alerts");
      }
      setData(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load executive alerts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleNavigate = useCallback((alert: ExecutiveAlert) => {
    navigateRecruitingTab({
      tab: alert.destination.tabId,
      elementId: alert.destination.elementId,
    });
  }, []);

  const byCategory = useMemo(() => {
    const alerts = data?.alerts ?? [];
    return {
      territory: alerts.filter((row) => row.category === "territory"),
      project: alerts.filter((row) => row.category === "project"),
      recruiter: alerts.filter((row) => row.category === "recruiter"),
      placement: alerts.filter((row) => row.category === "placement"),
    };
  }, [data?.alerts]);

  const cacheLabel = data?.intelligenceCache
    ? `${data.intelligenceCache.cacheStatus} · ${Math.round(data.intelligenceCache.snapshotAgeMs / 1000)}s`
    : null;

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(data?.alerts?.length)}
      loadingMessage="Generating executive alerts…"
      emptyTitle="No alerts generated"
      emptyMessage="Executive alerts will appear when recruiting intelligence identifies actionable risks."
      emptyNextStep="Try refresh after the intelligence cache completes its next sync."
      onRefresh={() => void load(true)}
      partialDataAvailable={Boolean(data?.alerts?.length)}
    >
      {data ? (
        <div id="executive-alert-center" className={UI_SPACE.page}>
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Executive Alerts</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Prioritized company risks and recommended actions from the unified recruiting intelligence snapshot.
              </p>
            </div>
            <div className={`${UI_LAYOUT.toolbar} items-center`}>
              {cacheLabel ? (
                <span className="rounded border border-zinc-700/80 px-2 py-1 text-[10px] text-zinc-400">
                  Intel cache · {cacheLabel}
                </span>
              ) : null}
              {data.meta ? (
                <span className="text-xs text-zinc-500">
                  {data.meta.totalCount} alerts · {data.meta.bySeverity.critical} critical
                </span>
              ) : null}
              <button
                type="button"
                className={UI_BUTTON.secondary}
                disabled={refreshing}
                onClick={() => void load(true)}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
          <div className={`${UI_SURFACE.panel} ${UI_SPACE.gridKpi}`}>
            <div>
              <p className={UI_TYPE.kpiLabel}>Critical</p>
              <p className={`${UI_TYPE.kpiValue} text-red-200`}>{data.meta?.bySeverity.critical ?? 0}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>High priority</p>
              <p className={UI_TYPE.kpiValue}>{data.meta?.bySeverity.high ?? 0}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Top actions</p>
              <p className={UI_TYPE.kpiValue}>{data.topActions?.length ?? 0}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Generated</p>
              <p className="text-sm text-zinc-300">
                {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          <AlertSection
            title="Critical Alerts"
            subtitle="Top 10 critical items requiring immediate leadership attention."
            alerts={data.topCritical ?? []}
            emptyMessage="No critical alerts right now."
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="High Priority Actions"
            subtitle="Ranked by impact score across the company."
            alerts={(data.topActions ?? []).filter((row) => row.severity !== "critical").slice(0, 15)}
            emptyMessage="No high-priority actions queued."
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="Territory Risks"
            subtitle="DM territories with coverage or escalation risk."
            alerts={byCategory.territory.slice(0, 8)}
            emptyMessage="Territories look stable."
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="Project Risks"
            subtitle="Stores and projects with coverage or forecast failures."
            alerts={byCategory.project.slice(0, 8)}
            emptyMessage="No elevated project risks."
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="Recruiter Risks"
            subtitle="Workload imbalance, follow-ups, and paperwork backlog."
            alerts={byCategory.recruiter.slice(0, 8)}
            emptyMessage="Recruiter workloads look balanced."
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="Placement Risks"
            subtitle="Zero-pipeline stores, open-call recovery, and funnel degradation."
            alerts={byCategory.placement.slice(0, 8)}
            emptyMessage="Placement funnel looks healthy."
            onNavigate={handleNavigate}
          />
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
