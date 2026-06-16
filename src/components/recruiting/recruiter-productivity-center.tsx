"use client";

import { NotificationCriticalAlertsPanel } from "@/components/notifications/notification-critical-alerts-panel";
import { RecruiterOperatingSystem } from "@/components/recruiter/recruiter-operating-system";
import { RecruiterOperationalKpiStrip } from "@/components/recruiting/recruiter-operational-kpi-strip";
import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { buildDataTrustState } from "@/lib/data-trust-state";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type {
  RecruiterDailyTask,
  RecruiterProductivitySnapshot,
} from "@/lib/recruiter-productivity-center";
import { navigateRecruiterActionCenter } from "@/lib/recruiting-tab-navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProductivityResponse = {
  ok?: boolean;
  snapshot?: RecruiterProductivitySnapshot;
  filterOptions?: { recruiters: string[]; states: string[] };
  meta?: {
    partialSync?: boolean;
    scanMode?: string;
    positionsScanned?: number;
    totalPositionsAvailable?: number;
    refreshedAt?: string;
  };
  error?: string;
};

const TASK_TONE: Record<RecruiterDailyTask["type"], string> = {
  "call-candidate": "border-sky-500/30 bg-sky-500/5 text-sky-100",
  "send-paperwork": "border-teal-500/30 bg-teal-500/5 text-teal-100",
  "follow-up": "border-amber-500/30 bg-amber-500/5 text-amber-100",
  "escalate-dm": "border-violet-500/30 bg-violet-500/5 text-violet-100",
};

function openCandidatesTab(candidateId?: string) {
  if (candidateId) {
    navigateRecruiterActionCenter({ kind: "candidate", candidateId });
    return;
  }
  navigateRecruiterActionCenter({ kind: "queue", queue: "work-now" });
}

export function RecruiterProductivityCenter() {
  const [snapshot, setSnapshot] = useState<RecruiterProductivitySnapshot | null>(null);
  const [recruiters, setRecruiters] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [selectedRecruiter, setSelectedRecruiter] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<ProductivityResponse["meta"]>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedRecruiter) params.set("recruiter", selectedRecruiter);
      if (selectedState) params.append("state", selectedState);
      const query = params.toString();
      const res = await fetchWithTimeout(
        `/api/recruiting/productivity${query ? `?${query}` : ""}`,
        { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS },
      );
      const parsed = (await res.json()) as ProductivityResponse;
      if (!parsed.ok || !parsed.snapshot) {
        setError(parsed.error ?? "Unable to load recruiter productivity.");
        return;
      }
      setSnapshot(parsed.snapshot);
      setRecruiters(parsed.filterOptions?.recruiters ?? []);
      setStates(parsed.filterOptions?.states ?? []);
      setMeta(parsed.meta);
    } catch {
      setError("Unable to load recruiter productivity.");
    } finally {
      setLoading(false);
    }
  }, [selectedRecruiter, selectedState]);

  useEffect(() => {
    void load();
  }, [load]);

  const dashboardKpis = useMemo(() => {
    if (!snapshot) return [];
    const d = snapshot.dashboard;
    return [
      { id: "applicants-assigned", label: "Applicants assigned", value: String(d.applicantsAssigned) },
      { id: "new-applicants-today", label: "New applicants today", value: String(d.newApplicantsToday) },
      { id: "follow-ups-due", label: "Follow ups due", value: String(d.followUpsDue), tone: d.followUpsDue > 0 ? ("warn" as const) : ("neutral" as const) },
      { id: "paperwork-pending", label: "Paperwork pending", value: String(d.paperworkPending) },
      { id: "ready-for-mel", label: "Ready for MEL", value: String(d.readyForMel) },
      { id: "hired-this-week", label: "Hired this week", value: String(d.hiredThisWeek), tone: "good" as const },
    ];
  }, [snapshot]);

  const trustInput = {
    hasData: Boolean(snapshot),
    partialSync: meta?.partialSync,
    scanMode: meta?.scanMode,
    positionsScanned: meta?.positionsScanned,
    totalPositionsAvailable: meta?.totalPositionsAvailable,
  };
  const trustState = buildDataTrustState(trustInput);

  if (loading && !snapshot) {
    return <p className="text-sm text-zinc-500">Loading recruiter productivity center…</p>;
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-6">
      <RecruiterOperatingSystem />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Recruiter productivity center</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Daily KPIs, scorecards, aging, and task queue from Breezy + local workflow state.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataTrustBadge trust={trustInput} state={trustState} />
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800/60 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <NotificationCriticalAlertsPanel
        title="Recruiter notifications"
        description="Follow-ups, aging candidates, and paperwork alerts for your queue."
        compact
      />

      <div className="flex flex-wrap gap-3">
        <label className="text-xs text-zinc-400">
          Recruiter
          <select
            value={selectedRecruiter}
            onChange={(event) => setSelectedRecruiter(event.target.value)}
            className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">All recruiters</option>
            {recruiters.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Territory state
          <select
            value={selectedState}
            onChange={(event) => setSelectedState(event.target.value)}
            className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">All states in scope</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
      </div>

      <RecruiterOperationalKpiStrip kpis={dashboardKpis} trustState={trustState} trustInput={trustInput} />

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4">
        <h3 className="text-sm font-semibold text-zinc-100">Recruiter scorecards</h3>
        <p className="mt-1 text-xs text-zinc-500">Contact, paperwork, and hire conversion by recruiter.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2 pr-4 font-medium">Recruiter</th>
                <th className="pb-2 pr-4 font-medium">Assigned</th>
                <th className="pb-2 pr-4 font-medium">Contact rate</th>
                <th className="pb-2 pr-4 font-medium">Paperwork conv.</th>
                <th className="pb-2 pr-4 font-medium">Hire conv.</th>
                <th className="pb-2 pr-4 font-medium">Avg 1st contact</th>
                <th className="pb-2 font-medium">Avg days to hire</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {snapshot.scorecards.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-zinc-500">
                    No recruiter assignments in current filter.
                  </td>
                </tr>
              ) : (
                snapshot.scorecards.map((row) => (
                  <tr key={row.recruiter}>
                    <td className="py-2.5 pr-4 font-medium">{row.recruiter}</td>
                    <td className="py-2.5 pr-4 tabular-nums">{row.assignedCount}</td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {row.contactRatePercent !== null ? `${row.contactRatePercent}%` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {row.paperworkConversionPercent !== null ? `${row.paperworkConversionPercent}%` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {row.hireConversionPercent !== null ? `${row.hireConversionPercent}%` : "—"}
                    </td>
                    <td className="py-2.5 pr-4 tabular-nums">
                      {row.avgTimeToFirstContactHours !== null
                        ? `${row.avgTimeToFirstContactHours}h`
                        : "—"}
                    </td>
                    <td className="py-2.5 tabular-nums">
                      {row.avgDaysToHire !== null ? `${row.avgDaysToHire}d` : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4">
          <h3 className="text-sm font-semibold text-zinc-100">Candidate aging</h3>
          <p className="mt-1 text-xs text-zinc-500">Days since application in current filter.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {snapshot.agingBuckets.map((bucket) => (
              <div
                key={bucket.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-center"
              >
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">{bucket.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{bucket.count}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Daily task queue</h3>
              <p className="mt-1 text-xs text-zinc-500">Prioritized actions for today.</p>
            </div>
            <button
              type="button"
              onClick={() => openCandidatesTab()}
              className="text-xs font-medium text-teal-400 hover:text-teal-300"
            >
              Open full queue
            </button>
          </div>
          <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {snapshot.dailyTasks.length === 0 ? (
              <li className="text-sm text-zinc-500">No open tasks for current filters.</li>
            ) : (
              snapshot.dailyTasks.slice(0, 12).map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => openCandidatesTab(task.candidateId)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${TASK_TONE[task.type]}`}
                  >
                    <span className="font-semibold">{task.label}</span>
                    <span className="mt-0.5 block text-zinc-300">
                      {task.candidateName} · {task.city}, {task.state}
                    </span>
                    <span className="mt-0.5 block text-zinc-500">{task.detail}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <p className="text-xs text-zinc-600">
        Snapshot {new Date(snapshot.fetchedAt).toLocaleString()}
        {meta?.refreshedAt ? ` · API ${new Date(meta.refreshedAt).toLocaleTimeString()}` : ""}
        {snapshot.productivityScore > 0 ? ` · Productivity score ${snapshot.productivityScore}` : ""}
      </p>
    </div>
  );
}
