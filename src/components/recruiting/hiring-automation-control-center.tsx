"use client";

import type { AutomationRun, ControlCenterSnapshot } from "@/lib/hiring-automation-engine/types";
import { AUTOMATION_TYPE_LABELS } from "@/lib/hiring-automation-engine/types";
import { useCallback, useEffect, useState } from "react";

const STATUS_STYLES: Record<AutomationRun["status"], string> = {
  pending: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  approved: "border-teal-500/35 bg-teal-500/10 text-teal-100",
  executed: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
  failed: "border-red-500/35 bg-red-500/10 text-red-100",
  rejected: "border-zinc-600 bg-zinc-900 text-zinc-400",
  cancelled: "border-zinc-700 bg-zinc-950 text-zinc-500",
};

function RunCard({
  run,
  onAction,
  busy,
}: {
  run: AutomationRun;
  onAction: (id: string, action: "approve" | "reject" | "execute") => void;
  busy: string | null;
}) {
  return (
    <li className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-zinc-100">{AUTOMATION_TYPE_LABELS[run.type]}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{run.reason}</p>
        </div>
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_STYLES[run.status]}`}>
          {run.status}
        </span>
      </div>
      <dl className="mt-3 grid gap-1 text-xs text-zinc-400">
        {run.candidateId ? (
          <div>
            <dt className="inline font-medium text-zinc-500">Candidate: </dt>
            <dd className="inline">{run.payload?.candidateName ?? run.candidateId}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline font-medium text-zinc-500">Expected: </dt>
          <dd className="inline">{run.expectedOutcome}</dd>
        </div>
        {run.resultSummary ? (
          <div>
            <dt className="inline font-medium text-zinc-500">Result: </dt>
            <dd className="inline text-emerald-200/90">{run.resultSummary}</dd>
          </div>
        ) : null}
        {run.failureReason ? (
          <div>
            <dt className="inline font-medium text-zinc-500">Error: </dt>
            <dd className="inline text-red-200/90">{run.failureReason}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {run.status === "pending" ? (
          <>
            <button
              type="button"
              disabled={busy === run.id}
              onClick={() => onAction(run.id, "approve")}
              className="rounded-md border border-teal-500/40 bg-teal-500/15 px-2.5 py-1 text-xs font-medium text-teal-100 hover:bg-teal-500/25 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy === run.id}
              onClick={() => onAction(run.id, "reject")}
              className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              Reject
            </button>
          </>
        ) : null}
        {run.status === "approved" || (run.status === "pending" && !run.requiresApproval) ? (
          <button
            type="button"
            disabled={busy === run.id}
            onClick={() => onAction(run.id, "execute")}
            className="rounded-md border border-teal-500/40 bg-teal-500/15 px-2.5 py-1 text-xs font-medium text-teal-100 hover:bg-teal-500/25 disabled:opacity-50"
          >
            Execute
          </button>
        ) : null}
        {run.candidateId ? (
          <a
            href={`/?tab=candidates&candidateId=${run.candidateId}`}
            className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Open candidate
          </a>
        ) : null}
      </div>
    </li>
  );
}

function RunSection({ title, runs, onAction, busy }: {
  title: string;
  runs: AutomationRun[];
  onAction: (id: string, action: "approve" | "reject" | "execute") => void;
  busy: string | null;
}) {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <span className="rounded-full bg-zinc-800/80 px-2 py-0.5 text-xs tabular-nums text-zinc-300">{runs.length}</span>
      </div>
      {runs.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">None.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {runs.slice(0, 20).map((run) => (
            <RunCard key={run.id} run={run} onAction={onAction} busy={busy} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function HiringAutomationControlCenter() {
  const [snapshot, setSnapshot] = useState<ControlCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/hiring-automation/runs", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; snapshot?: ControlCenterSnapshot; error?: string };
      if (!data.ok || !data.snapshot) throw new Error(data.error ?? "Failed to load automations");
      setSnapshot(data.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function planRuns() {
    setPlanning(true);
    setError(null);
    try {
      const res = await fetch("/api/hiring-automation/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { ok: boolean; snapshot?: ControlCenterSnapshot; error?: string };
      if (!data.ok || !data.snapshot) throw new Error(data.error ?? "Plan failed");
      setSnapshot(data.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan failed");
    } finally {
      setPlanning(false);
    }
  }

  async function runAction(id: string, action: "approve" | "reject" | "execute") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/hiring-automation/runs/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { ok: boolean; snapshot?: ControlCenterSnapshot; error?: string };
      if (!data.ok || !data.snapshot) throw new Error(data.error ?? `${action} failed`);
      setSnapshot(data.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !snapshot) {
    return <p className="text-sm text-zinc-500">Loading automation control center…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Automation Control Center</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Pending, approved, executed, and failed automations with audit trail. Ads and paperwork require approval.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void planRuns()}
            disabled={planning}
            className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-2 text-sm font-medium text-teal-100 hover:bg-teal-500/25 disabled:opacity-50"
          >
            {planning ? "Planning…" : "Scan pipeline"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>
      ) : null}

      {snapshot ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <RunSection title="Pending approval" runs={snapshot.pending} onAction={runAction} busy={busyId} />
          <RunSection title="Approved — ready to execute" runs={snapshot.approved} onAction={runAction} busy={busyId} />
          <RunSection title="Executed" runs={snapshot.executed} onAction={runAction} busy={busyId} />
          <RunSection title="Failed" runs={snapshot.failed} onAction={runAction} busy={busyId} />
        </div>
      ) : null}
    </div>
  );
}
