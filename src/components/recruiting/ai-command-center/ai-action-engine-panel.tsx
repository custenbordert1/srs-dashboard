"use client";

import { AiBulkActionButton, AiInsightActionButton } from "@/components/recruiting/ai-command-center/ai-insight-action-button";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { AiActionCenterSnapshot } from "@/lib/ai-action-engine";
import { useEffect, useState } from "react";

export function AiActionEnginePanel() {
  const [center, setCenter] = useState<AiActionCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/recruiting/ai-action-engine", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as { ok?: boolean; center?: AiActionCenterSnapshot };
        if (!cancelled && parsed.ok && parsed.center) setCenter(parsed.center);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (loading && !center) {
    return <p className="text-sm text-zinc-500">Loading AI action engine…</p>;
  }
  if (!center) return null;

  const recoveryBulk = center.candidateRecovery.slice(0, 5).map((row) => ({
    insightId: `recovery:${row.candidateId}`,
    recommendation: row.reason,
    actionKind: row.recommendedAction,
    payload: { candidateId: row.candidateId },
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">AI Action Engine</h2>
          <p className="mt-1 text-sm text-zinc-400">One-click execution from AI recommendations</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setReloadToken((token) => token + 1);
          }}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {statusMessage ? (
        <p className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-sm text-teal-100">
          {statusMessage}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Recommendations tracked", value: center.memorySummary.recommendationsTracked },
          { label: "Actions taken", value: center.memorySummary.actionsTaken },
          { label: "Success rate", value: `${center.memorySummary.successRate}%` },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{kpi.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Executive action center</h3>
        <div className="mt-3 space-y-3">
          {center.executiveActions.slice(0, 8).map((action) => (
            <article key={action.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{action.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">{action.explanation}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Priority {action.priorityScore} · {action.expectedImpact}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {action.proposals.slice(0, 3).map((proposal) => (
                    <AiInsightActionButton
                      key={proposal.id}
                      proposal={proposal}
                      recommendation={`${action.title}: ${action.explanation}`}
                      compact
                      onExecuted={setStatusMessage}
                    />
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-zinc-50">Candidate recovery</h3>
          <AiBulkActionButton
            actions={recoveryBulk}
            label="Bulk recover"
            onExecuted={(count) => setStatusMessage(`${count} recovery actions completed`)}
          />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Candidate</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Reason</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {center.candidateRecovery.slice(0, 10).map((row) => (
                <tr key={row.candidateId}>
                  <td className="px-2 py-2">{row.name}</td>
                  <td className="px-2 py-2">{row.recoveryType}</td>
                  <td className="px-2 py-2">{row.reason}</td>
                  <td className="px-2 py-2">
                    <AiInsightActionButton
                      proposal={{
                        id: `recovery:${row.candidateId}:${row.recommendedAction}`,
                        insightId: `recovery:${row.candidateId}`,
                        actionKind: row.recommendedAction,
                        label: row.recommendedAction.replace(/-/g, " "),
                        description: row.reason,
                        payload: { candidateId: row.candidateId },
                        priorityScore: row.priorityScore,
                        expectedImpact: "Recover candidate in pipeline",
                        severity: "high",
                        manualOnly: true,
                      }}
                      recommendation={row.reason}
                      compact
                      onExecuted={setStatusMessage}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">AI workflow builder</h3>
        <div className="mt-3 space-y-2">
          {center.triggeredWorkflows.map((workflow) => (
            <div key={workflow.ruleId} className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
              <p className="text-sm font-medium text-violet-100">{workflow.ruleName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {workflow.proposedActions.map((proposal) => (
                  <AiInsightActionButton
                    key={proposal.id}
                    proposal={proposal}
                    recommendation={workflow.ruleName}
                    compact
                    onExecuted={setStatusMessage}
                  />
                ))}
              </div>
            </div>
          ))}
          {center.triggeredWorkflows.length === 0 ? (
            <p className="text-sm text-zinc-500">No workflow rules triggered in current snapshot.</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Territory recovery plans</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {center.territoryRecoveryPlans.slice(0, 4).map((plan) => (
            <div key={plan.territory} className="rounded-lg border border-zinc-800/80 p-3">
              <p className="text-sm font-medium text-zinc-100">
                {plan.territory} · attention {plan.attentionScore}
              </p>
              <p className="mt-2 text-xs text-zinc-500">Immediate</p>
              <ul className="text-xs text-zinc-300">
                {plan.immediate.map((item) => (
                  <li key={item}>→ {item}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-zinc-500">7-day</p>
              <ul className="text-xs text-zinc-300">
                {plan.sevenDay.slice(0, 2).map((item) => (
                  <li key={item}>→ {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-base font-semibold text-zinc-50">Action audit trail</h3>
        <ul className="mt-3 space-y-2 text-sm text-zinc-300">
          {center.recentAudit.slice(0, 8).map((entry) => (
            <li key={entry.id} className="rounded border border-zinc-800/80 px-3 py-2">
              <span className={entry.outcome === "success" ? "text-teal-300" : "text-red-300"}>
                {entry.outcome}
              </span>{" "}
              · {entry.actionKind} · {entry.outcomeDetail}
              <span className="ml-2 text-xs text-zinc-500">{entry.timestamp}</span>
            </li>
          ))}
          {center.recentAudit.length === 0 ? (
            <li className="text-zinc-500">No actions executed yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
