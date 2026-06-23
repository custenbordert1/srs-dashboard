"use client";

import { useAutonomousRecruiting } from "@/hooks/use-autonomous-recruiting";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import type { AutopilotOperatingMode } from "@/lib/autonomous-recruiting-autopilot";

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
    </div>
  );
}

const MODE_LABELS: Record<AutopilotOperatingMode, string> = {
  manual: "Manual mode",
  "semi-automatic": "Semi-automatic",
  automatic: "Automatic",
};

export function RecruitingAutopilotOpsPanel() {
  const {
    autopilotDashboard,
    loading,
    error,
    timedOut,
    showingCachedSnapshot,
    refresh,
    actionBusy,
    runAutopilot,
    pauseAutopilot,
    resumeAutopilot,
    setAutopilotMode,
  } = useAutonomousRecruiting();

  const loadingCeilingHit = useLoadingCeiling(loading && !autopilotDashboard, EXECUTIVE_PANEL_LOADING_CEILING_MS);
  const showLoading = loading && !autopilotDashboard && !loadingCeilingHit;

  if (showLoading) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="h-8 w-56 animate-pulse rounded bg-zinc-800/80" />
      </section>
    );
  }

  if ((error || timedOut) && !autopilotDashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p>{error ?? "Autopilot operations dashboard is still loading."}</p>
        <button type="button" onClick={() => refresh()} className="mt-2 rounded-lg border border-amber-400/40 px-3 py-1 text-xs">
          Retry
        </button>
      </section>
    );
  }

  if (!autopilotDashboard) return null;

  const { policy, performance, feedback, recentRuns } = autopilotDashboard;

  return (
    <section className="space-y-6">
      {showingCachedSnapshot ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Showing last loaded autopilot dashboard.
          {error ? ` ${error}` : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Executive Autopilot Operations</h2>
          <p className="text-sm text-zinc-500">
            Continuous planning, auto-approval, execution orchestration, and closed-loop optimization.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void runAutopilot()}
            className="rounded-lg border border-teal-500/40 px-3 py-1.5 text-xs text-teal-100 hover:bg-teal-500/15 disabled:opacity-50"
          >
            Run planner now
          </button>
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Autopilot status</p>
            <p className="mt-1 text-lg font-medium capitalize text-zinc-100">
              {autopilotDashboard.status} · {MODE_LABELS[policy.mode]}
            </p>
            {policy.lastRunAt ? (
              <p className="mt-1 text-xs text-zinc-500">Last run {new Date(policy.lastRunAt).toLocaleString()}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {policy.paused ? (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void resumeAutopilot()}
                className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-100"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => void pauseAutopilot()}
                className="rounded-md border border-amber-500/40 px-2 py-1 text-xs text-amber-100"
              >
                Pause
              </button>
            )}
            {(["manual", "semi-automatic", "automatic"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={actionBusy || policy.mode === mode}
                onClick={() => void setAutopilotMode(mode)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  policy.mode === mode
                    ? "border-teal-500/50 bg-teal-500/15 text-teal-100"
                    : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Auto-approved today" value={autopilotDashboard.autoApprovedToday} />
        <KpiCard label="Executed today" value={autopilotDashboard.executedToday} />
        <KpiCard label="Awaiting approval" value={autopilotDashboard.awaitingApproval} />
        <KpiCard label="Territories improved" value={autopilotDashboard.territoriesImproved} />
        <KpiCard label="Coverage risk reduced" value={`${autopilotDashboard.coverageRiskReduced}%`} />
        <KpiCard label="Posting success" value={`${performance.postingSuccessRate}%`} />
        <KpiCard label="Applicant conversion" value={`${performance.applicantConversionRate}%`} />
        <KpiCard
          label="Time to fill"
          value={performance.timeToFillDays ?? "—"}
          detail={performance.timeToFillDays !== null ? "days avg" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Top performing types</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {feedback.topPerforming.slice(0, 5).map((row) => (
              <li key={row.key} className="flex justify-between gap-2 rounded-lg border border-zinc-800/60 p-2">
                <span className="text-zinc-300">
                  {row.territory} · {row.recommendationType}
                  {row.postingAction ? ` · ${row.postingAction}` : ""}
                </span>
                <span className="font-semibold text-emerald-300">{row.effectivenessScore}%</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Lowest performing types</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {feedback.lowestPerforming.slice(0, 5).map((row) => (
              <li key={row.key} className="flex justify-between gap-2 rounded-lg border border-zinc-800/60 p-2">
                <span className="text-zinc-300">
                  {row.territory} · {row.recommendationType}
                </span>
                <span className="font-semibold text-amber-300">{row.effectivenessScore}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recent planner runs</h3>
        <ul className="mt-3 space-y-2 text-xs text-zinc-400">
          {recentRuns.slice(0, 8).map((run) => (
            <li key={run.id} className="rounded border border-zinc-800/60 p-2">
              <span className="text-zinc-300">{new Date(run.completedAt).toLocaleString()}</span>
              {" · "}
              {run.mode} · planned {run.recommendationsPlanned} · auto-approved {run.autoApproved} · executed{" "}
              {run.executed}
              {run.matchedRuleIds.length > 0 ? ` · rules: ${run.matchedRuleIds.join(", ")}` : ""}
              {run.errors.length > 0 ? ` · errors: ${run.errors.length}` : ""}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          System auto-approvals create Executive Accountability records with approval source = system and rule metadata.
        </p>
      </div>
    </section>
  );
}
