"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type { AutonomousRecruitingPlannerSnapshot } from "@/lib/autonomous-recruiting-planner";
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
import { useCallback, useEffect, useState, type ReactNode } from "react";

type PlannerResponse = {
  ok?: boolean;
  snapshot?: AutonomousRecruitingPlannerSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
    scopedToTerritory?: boolean;
    scopedToRecruiter?: boolean;
  };
  error?: string;
};

type AutonomousRecruitingPlannerPanelProps = {
  compact?: boolean;
  variant?: "executive" | "dm" | "recruiter" | "full";
};

const STATUS_STYLES: Record<string, string> = {
  "on-track": UI_RISK.healthy,
  "needs-intervention": UI_RISK.atRisk,
  "needs-resources": UI_RISK.critical,
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

export function AutonomousRecruitingPlannerPanel({
  compact = false,
  variant = "full",
}: AutonomousRecruitingPlannerPanelProps) {
  const [snapshot, setSnapshot] = useState<AutonomousRecruitingPlannerSnapshot | null>(null);
  const [meta, setMeta] = useState<PlannerResponse["meta"]>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithTimeout("/api/autonomous-recruiting-planner", {
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const payload = (await response.json()) as PlannerResponse;
      if (!response.ok || !payload.ok || !payload.snapshot) {
        throw new Error(payload.error ?? "Failed to load autonomous recruiting planner");
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
    <div id="autonomous-recruiting-planner" className={compact ? "space-y-3" : UI_SPACE.page}>
      {!compact ? (
        <div className={UI_LAYOUT.pageHeader}>
          <div>
            <h2 className={UI_TYPE.pageTitle}>Autonomous Recruiting Planner</h2>
            <p className={UI_TYPE.pageSubtitle}>
              Optimal recruiting strategy for the next 7, 14, and 30 days
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
        <SectionCard
          title="Executive Strategy"
          subtitle={snapshot.executiveStrategy.headline}
        >
          <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
            <KpiCard
              label="Best plan score"
              value={snapshot.executiveStrategy.bestPlan.optimizationScore}
            />
            <KpiCard
              label="Coverage"
              value={snapshot.executiveStrategy.bestPlan.outcomes.coveragePercent}
              suffix="%"
            />
            <KpiCard
              label="Expected hires"
              value={snapshot.executiveStrategy.bestPlan.outcomes.expectedHires}
            />
            <KpiCard
              label="Risk reduction"
              value={snapshot.executiveStrategy.bestPlan.outcomes.riskReduction}
              suffix="%"
            />
          </div>
          {snapshot.executiveStrategy.tradeOffs.length > 0 ? (
            <div className="mt-3 space-y-2">
              {snapshot.executiveStrategy.tradeOffs.map((tradeOff) => (
                <div
                  key={tradeOff.dimension}
                  className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-xs text-zinc-400"
                >
                  <span className="font-semibold text-zinc-200">{tradeOff.dimension}:</span>{" "}
                  {tradeOff.tradeOff}
                </div>
              ))}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard title="Planning Horizons" subtitle="7, 14, and 30-day optimized plans">
        <div className="space-y-2">
          {snapshot.plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-100">{plan.label}</p>
                <span className="text-xs tabular-nums text-teal-200/90">
                  {`Score ${plan.optimizationScore} · ${plan.confidenceScore}% conf.`}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{plan.headline}</p>
              {plan.keyActions.length > 0 ? (
                <ul className="mt-2 list-inside list-disc text-xs text-zinc-500">
                  {plan.keyActions.slice(0, compact ? 2 : 4).map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      {showExecutive ? (
        <SectionCard title="Goal Planning" subtitle={snapshot.goalPlanning.summary}>
          <div className="space-y-2">
            {snapshot.goalPlanning.goals.map((goal) => (
              <div
                key={goal.kind}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-zinc-100">{goal.label}</p>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      goal.achievable ? UI_RISK.healthy : UI_RISK.atRisk
                    }`}
                  >
                    {goal.achievable ? "Achievable" : "Gap"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  Target {goal.targetValue} · Projected {goal.projectedValue} · Gap {goal.gap}
                </p>
                {goal.requiredActions.length > 0 ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Actions: {goal.requiredActions.slice(0, 2).join(" · ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {showDm ? (
        <SectionCard title="Territory Action Plans" subtitle="Top actions by territory">
          <div className="space-y-2">
            {snapshot.territoryActionPlans.slice(0, compact ? 3 : 6).map((plan) => (
              <div
                key={plan.territoryId}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
              >
                <p className="text-sm font-medium text-zinc-100">
                  {plan.territoryLabel}{" "}
                  <span className="text-xs text-zinc-500">({plan.dmName})</span>
                </p>
                {plan.actions.slice(0, 2).map((action) => (
                  <p key={action.id} className="mt-1 text-xs text-zinc-400">
                    {action.title} · {action.effort} effort · {action.confidence} confidence
                  </p>
                ))}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {showRecruiter ? (
        <SectionCard title="Recruiter Work Plans" subtitle="Weekly priorities">
          <div className="space-y-2">
            {snapshot.recruiterWorkPlans.slice(0, compact ? 2 : 5).map((plan) => (
              <div
                key={plan.recruiterName}
                className="rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">{plan.recruiterName}</p>
                  <span className="text-[10px] uppercase text-zinc-500">{plan.capacityState}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-400">{plan.workloadSummary}</p>
                {plan.candidatePriorities[0] ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Top candidate: {plan.candidatePriorities[0].label}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {showExecutive ? (
        <>
          <SectionCard title="Resource Allocation" subtitle="Recommended assignments and campaigns">
            <div className="space-y-2">
              {snapshot.resourceAllocation.slice(0, compact ? 3 : 6).map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-lg border border-teal-500/20 bg-teal-500/5 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-teal-50">{rec.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{rec.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Project Outlook" subtitle="Success, intervention, and resource needs">
            <div className="space-y-2">
              {snapshot.projectOutlooks.slice(0, compact ? 3 : 6).map((project) => (
                <div
                  key={project.projectId}
                  className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-zinc-100">{project.projectName}</p>
                    <p className="text-xs text-zinc-400">{project.reason}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      STATUS_STYLES[project.status] ?? UI_RISK.atRisk
                    }`}
                  >
                    {project.status.replace(/-/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          {snapshot.riskConstraints.constraints.length > 0 ? (
            <SectionCard title="Risk Constraints" subtitle="Capacity and availability limits">
              <ul className="list-inside list-disc space-y-1 text-xs text-zinc-400">
                {snapshot.riskConstraints.constraints.map((constraint) => (
                  <li key={constraint}>{constraint}</li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </div>
  ) : null;

  if (compact) {
    if (loading && !snapshot) {
      return <p className="text-sm text-zinc-500">Loading recruiting planner…</p>;
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
      loadingMessage="Loading autonomous recruiting planner…"
      emptyTitle="No planner data yet"
      emptyMessage="Plans will appear after the next successful intelligence sync."
      emptyNextStep="Try refresh, or confirm Breezy and MEL integrations are healthy."
      onRefresh={() => void load()}
      partialDataAvailable={Boolean(snapshot)}
    >
      {content}
    </WorkspacePageShell>
  );
}
