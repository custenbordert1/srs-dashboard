"use client";

import type { AutonomousPaperworkDashboardSnapshot, PaperworkLifecycleStatus } from "@/lib/autonomous-paperwork-engine/types";
import { useCallback, useEffect, useState } from "react";

const LIFECYCLE_STATUS_LABELS: Record<PaperworkLifecycleStatus, string> = {
  eligible: "Eligible",
  queued: "Queued",
  generating: "Generating",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  expired: "Expired",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_recruiter_review: "Needs Recruiter Review",
};

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function statusTone(status: string): string {
  switch (status) {
    case "signed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
    case "sent":
    case "viewed":
      return "border-sky-500/35 bg-sky-500/10 text-sky-100";
    case "failed":
    case "expired":
      return "border-rose-500/40 bg-rose-500/10 text-rose-100";
    case "queued":
    case "generating":
      return "border-violet-500/35 bg-violet-500/10 text-violet-100";
    case "needs_recruiter_review":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    default:
      return "border-zinc-700 bg-zinc-900/60 text-zinc-300";
  }
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AutonomousPaperworkPanel() {
  const [dashboard, setDashboard] = useState<AutonomousPaperworkDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-paperwork", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: AutonomousPaperworkDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load autonomous paperwork preview");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load autonomous paperwork preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !dashboard) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Autonomous Paperwork Engine</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Autonomous Paperwork Engine</h2>
        <p className="mt-2 text-sm text-amber-100/90">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!dashboard) return null;

  const today = dashboard.todayActivity;
  const exec = dashboard.executiveMetrics;
  const readiness = dashboard.automationReadiness;

  return (
    <section className="rounded-2xl border border-teal-500/30 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Autonomous Paperwork Engine</h2>
            <span className="rounded-full border border-teal-400/40 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-200">
              Preview Mode
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            P70 paperwork lifecycle intelligence · read-only · no Dropbox Sign · no live emails · no automatic execution
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-teal-500/20 bg-teal-500/5 px-3 py-2 text-xs text-teal-100/90">
          {warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Today&apos;s activity</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Paperwork sent today" value={today.paperworkSentToday.toLocaleString()} />
          <MetricCard label="Auto sent" value={today.autoSentToday.toLocaleString()} />
          <MetricCard label="Manual sent" value={today.manualSentToday.toLocaleString()} />
          <MetricCard label="Signed today" value={today.signedToday.toLocaleString()} />
          <MetricCard label="Pending signature" value={today.pendingSignature.toLocaleString()} />
          <MetricCard label="Expired" value={today.expired.toLocaleString()} />
          <MetricCard label="Failed" value={today.failed.toLocaleString()} />
          <MetricCard
            label="Avg time to sign"
            value={today.averageTimeToSignHours != null ? `${today.averageTimeToSignHours}h` : "—"}
          />
          <MetricCard
            label="Last packet sent"
            value={formatTimestamp(today.lastPacketSentAt)}
          />
        </div>
      </div>

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Executive metrics</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Today's sends" value={exec.todaysSends.toLocaleString()} />
          <MetricCard label="Today's signatures" value={exec.todaysSignatures.toLocaleString()} />
          <MetricCard label="Weekly send trend" value={exec.weeklySendTrend.toLocaleString()} />
          <MetricCard
            label="Auto send %"
            value={exec.autoSendPercent != null ? `${exec.autoSendPercent}%` : "—"}
          />
          <MetricCard
            label="Manual send %"
            value={exec.manualSendPercent != null ? `${exec.manualSendPercent}%` : "—"}
          />
          <MetricCard
            label="Failure rate"
            value={exec.failureRate != null ? `${exec.failureRate}%` : "—"}
          />
          <MetricCard label="Pending 24h+" value={exec.pendingOver24Hours.toLocaleString()} />
          <MetricCard label="Pending 48h+" value={exec.pendingOver48Hours.toLocaleString()} />
          <MetricCard label="Pending 72h+" value={exec.pendingOver72Hours.toLocaleString()} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Automation readiness</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Ready for auto send" value={readiness.readyForAutoSend.toLocaleString()} />
            <MetricCard label="Blocked" value={readiness.blocked.toLocaleString()} />
          </div>
          {readiness.blockReasons.length > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-zinc-300">
              {readiness.blockReasons.slice(0, 8).map((row) => (
                <li key={row.reason}>
                  {row.reason}: <span className="font-medium text-zinc-100">{row.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">No blocked candidates with recorded reasons.</p>
          )}
        </div>

        {dashboard.waitingTooLong.length > 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
              Waiting too long (48h+)
            </p>
            <ul className="mt-2 space-y-2">
              {dashboard.waitingTooLong.slice(0, 6).map((row) => (
                <li key={row.candidateId} className="text-xs text-amber-100/90">
                  <span className="font-medium">{row.candidateName}</span> — {row.elapsedLabel ?? "unknown"} ·{" "}
                  {row.owner}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {dashboard.failedPackets.length > 0 ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-200/80">Failed packets</p>
            <ul className="mt-2 space-y-2">
              {dashboard.failedPackets.slice(0, 6).map((row) => (
                <li key={row.candidateId} className="text-xs text-rose-100/90">
                  <span className="font-medium">{row.candidateName}</span> — {row.lastActivity} · {row.owner}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {dashboard.recruiterMetrics.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Recruiter metrics</p>
          <table className="mt-2 w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Recruiter</th>
                <th className="pb-2 pr-3">Manual</th>
                <th className="pb-2 pr-3">Auto</th>
                <th className="pb-2 pr-3">Signed</th>
                <th className="pb-2 pr-3">Pending</th>
                <th className="pb-2">Avg sign time</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recruiterMetrics.slice(0, 10).map((row) => (
                <tr key={row.recruiter} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.recruiter}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.manualSends}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.autoSends}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.signed}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.pending}</td>
                  <td className="py-2 tabular-nums text-zinc-300">
                    {row.averageSignTimeHours != null ? `${row.averageSignTimeHours}h` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {dashboard.candidateQueue.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Candidate queue</p>
          <table className="mt-2 w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Last activity</th>
                <th className="pb-2 pr-3">Elapsed</th>
                <th className="pb-2 pr-3">Owner</th>
                <th className="pb-2 pr-3">Source</th>
                <th className="pb-2">Retries</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.candidateQueue.slice(0, 15).map((row) => (
                <tr key={row.candidateId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.candidateName}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone(row.lifecycleStatus)}`}
                    >
                      {LIFECYCLE_STATUS_LABELS[row.lifecycleStatus]}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-zinc-400">{row.lastActivity}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-400">{row.elapsedLabel ?? "—"}</td>
                  <td className="py-2 pr-3 text-zinc-300">{row.owner}</td>
                  <td className="py-2 pr-3 text-xs capitalize text-zinc-400">{row.sendSource}</td>
                  <td className="py-2 tabular-nums text-zinc-300">{row.retryCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-500">
          No candidates in the paperwork pipeline yet.
        </p>
      )}
    </section>
  );
}
