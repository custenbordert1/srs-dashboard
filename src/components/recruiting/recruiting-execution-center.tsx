"use client";

import { useAutonomousRecruiting } from "@/hooks/use-autonomous-recruiting";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import type {
  ExecutionCorrelation,
  ExecutionFunnelStep,
  ExecutionOutcomeMetric,
  ExecutionStatus,
} from "@/lib/autonomous-recruiting-execution";

const STATUS_STYLES: Record<ExecutionStatus, string> = {
  detected: "border-zinc-600 bg-zinc-800/40 text-zinc-300",
  recommended: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  approved: "border-teal-500/35 bg-teal-500/10 text-teal-100",
  executing: "border-blue-500/35 bg-blue-500/10 text-blue-100",
  completed: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
  failed: "border-red-500/35 bg-red-500/10 text-red-100",
  archived: "border-zinc-700 bg-zinc-900/40 text-zinc-500",
};

function KpiCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
    </div>
  );
}

export function RecruitingExecutionCenter() {
  const {
    snapshot,
    executionSnapshot,
    loading,
    error,
    timedOut,
    showingCachedSnapshot,
    refresh,
    actionBusy,
    approveExecution,
    executeExecution,
  } = useAutonomousRecruiting();
  const loadingCeilingHit = useLoadingCeiling(loading && !snapshot, EXECUTIVE_PANEL_LOADING_CEILING_MS);
  const showLoading = loading && !snapshot && !loadingCeilingHit;

  if (showLoading) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="h-8 w-56 animate-pulse rounded bg-zinc-800/80" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-800/60" />
          ))}
        </div>
      </section>
    );
  }

  if ((error || timedOut) && !snapshot) {
    return (
      <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p>{error ?? "Execution center is still loading. Retry shortly."}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-2 rounded-lg border border-amber-400/40 px-3 py-1 text-xs"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!snapshot || !executionSnapshot) return null;

  const postingQueue = executionSnapshot.executionQueue.filter(
    (row: ExecutionCorrelation) => row.type === "posting" || row.type === "refresh",
  );

  return (
    <section className="space-y-6">
      {showingCachedSnapshot ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Showing last loaded execution snapshot.
          {error ? ` ${error}` : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Recruiting Execution Center</h2>
          <p className="text-sm text-zinc-500">
            Orchestrates approved autopilot recommendations — posting automation, recruiter tasks, and outcomes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Recommendations" value={executionSnapshot.kpis.recommendationsGenerated} />
        <KpiCard label="Approved" value={executionSnapshot.kpis.approved} />
        <KpiCard label="In progress" value={executionSnapshot.kpis.inProgress} />
        <KpiCard label="Completed" value={executionSnapshot.kpis.completed} />
        <KpiCard label="Posting success" value={`${executionSnapshot.kpis.postingSuccessRate}%`} />
        <KpiCard label="Applicant conversion" value={`${executionSnapshot.kpis.applicantConversionRate}%`} />
        <KpiCard
          label="Time saved"
          value={executionSnapshot.kpis.timeSaved}
          detail={executionSnapshot.kpis.hoursSavedFormula}
        />
        <KpiCard label="Coverage risk reduction" value={`${executionSnapshot.kpis.coverageRiskReduction}%`} />
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Execution funnel</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {executionSnapshot.executionFunnel.map((step: ExecutionFunnelStep) => (
            <div key={step.id} className="min-w-[6rem] rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{step.label}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-100">{step.count}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Execution queue</h3>
          <ul className="mt-3 space-y-2">
            {postingQueue.slice(0, 8).map((row) => (
              <li key={row.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-100">{row.displayTitle ?? row.recommendationId}</p>
                    <p className="text-xs text-zinc-500">{row.territory} · {row.adType}</p>
                  </div>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[row.status]}`}>
                    {row.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["detected", "recommended"].includes(row.status) ? (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void approveExecution(row.id)}
                      className="rounded-md border border-teal-500/40 px-2 py-1 text-xs text-teal-100 hover:bg-teal-500/15 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  ) : null}
                  {row.status === "approved" ? (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void executeExecution(row.id)}
                      className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-50"
                    >
                      Execute
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Posting automation</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {executionSnapshot.postingAutomation.slice(0, 8).map((row) => (
              <li key={row.executionId} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
                <p className="font-medium text-zinc-100">{row.title}</p>
                <p className="text-xs text-zinc-500">
                  {row.territory} · {row.adType} · {row.status}
                </p>
                {row.linkedJobDraftId ? (
                  <p className="mt-1 text-xs text-teal-300">Draft: {row.linkedJobDraftId}</p>
                ) : null}
                {row.linkedAutomationRunId ? (
                  <p className="mt-1 text-xs text-teal-300">Run: {row.linkedAutomationRunId}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recruiter task queue</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {executionSnapshot.recruiterTaskQueue.slice(0, 10).map((task) => (
              <li key={task.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <a href={task.href} className="font-medium text-teal-200 hover:text-teal-100 hover:underline">
                      {task.label}
                    </a>
                    <p className="text-xs text-zinc-500">
                      {task.owner} · {task.candidateName} · {task.risk}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Applicant performance</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-2 py-2">Territory</th>
                  <th className="px-2 py-2">Applicants</th>
                  <th className="px-2 py-2">Qualified</th>
                  <th className="px-2 py-2">Alerts</th>
                </tr>
              </thead>
              <tbody>
                {executionSnapshot.applicantPerformance.slice(0, 8).map((row) => (
                  <tr key={row.territoryKey} className="border-t border-zinc-800/60">
                    <td className="px-2 py-2 text-zinc-200">{row.territoryLabel}</td>
                    <td className="px-2 py-2 text-zinc-400">
                      {row.applicants}/{row.targetApplicants}
                    </td>
                    <td className="px-2 py-2 text-zinc-400">{row.qualified}</td>
                    <td className="px-2 py-2 text-xs text-amber-200">{row.alerts.join("; ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Outcomes</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {executionSnapshot.outcomes.map((outcome: ExecutionOutcomeMetric) => (
              <li key={outcome.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
                <div className="flex justify-between gap-2">
                  <span className="text-zinc-300">{outcome.label}</span>
                  <span className="font-semibold text-zinc-100">
                    {outcome.value}
                    {outcome.unit ? ` ${outcome.unit}` : ""}
                  </span>
                </div>
                {outcome.detail ? <p className="mt-1 text-xs text-zinc-500">{outcome.detail}</p> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Audit log</h3>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
            {executionSnapshot.auditLog.slice(0, 20).map((entry) => (
              <li key={entry.id} className="rounded border border-zinc-800/60 bg-zinc-950/30 p-2 text-zinc-400">
                <span className="text-zinc-500">{new Date(entry.at).toLocaleString()}</span>
                {" · "}
                <span className="text-zinc-300">{entry.action}</span>
                {" — "}
                {entry.detail}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
