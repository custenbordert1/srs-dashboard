"use client";

import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { DeferredSection } from "@/components/ui/deferred-section";
import { WorkforceOperationsSection } from "@/components/recruiting/workforce-operations-section";
import { buildDataTrustState } from "@/lib/data-trust-state";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { WorkforceOpsCenterSnapshot, WorkforceOpsQueueItem } from "@/lib/workforce-ops-center";
import { useEffect, useMemo, useState } from "react";

type WorkforceOpsResponse = {
  ok?: boolean;
  center?: WorkforceOpsCenterSnapshot;
  meta?: {
    partialSync?: boolean;
    scanMode?: string;
    hasMelData?: boolean;
    refreshedAt?: string;
  };
  error?: string;
};

const QUEUE_STYLES: Record<WorkforceOpsQueueItem["severity"], string> = {
  critical: "border-red-500/35 bg-red-500/10 text-red-100",
  high: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  medium: "border-sky-500/35 bg-sky-500/10 text-sky-100",
};

const PIPELINE_STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  "push-pending": "Push pending",
  assigned: "Assigned",
  loaded: "Loaded",
  completed: "Completed",
  stalled: "Stalled",
};

export function WorkforceOpsCenter({
  showLegacyPanels = true,
  showPasswordPanel = false,
}: {
  showLegacyPanels?: boolean;
  showPasswordPanel?: boolean;
}) {
  const [center, setCenter] = useState<WorkforceOpsCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<WorkforceOpsResponse["meta"]>();
  const [reloadToken, setReloadToken] = useState(0);
  const [pushingId, setPushingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/workforce-ops", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as WorkforceOpsResponse;
        if (cancelled) return;
        if (!parsed.ok || !parsed.center) {
          setError(parsed.error ?? "Unable to load workforce operations center.");
          return;
        }
        setError(null);
        setCenter(parsed.center);
        setMeta(parsed.meta);
      } catch {
        if (!cancelled) setError("Unable to load workforce operations center.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const trustInput = useMemo(
    () => ({
      hasData: Boolean(center),
      partialSync: meta?.partialSync,
      scanMode: meta?.scanMode,
    }),
    [center, meta],
  );
  const trustState = useMemo(() => buildDataTrustState(trustInput), [trustInput]);

  const pushToMel = async (candidateId: string, opportunityId: string | null) => {
    setPushingId(candidateId);
    try {
      await fetchWithTimeout("/api/workforce-ops/mel-pipeline/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, opportunityId }),
        timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
      });
      setReloadToken((token) => token + 1);
    } finally {
      setPushingId(null);
    }
  };

  if (loading && !center) {
    return <p className="text-sm text-zinc-500">Loading workforce operations center…</p>;
  }

  if (error && !center) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (!center) return null;

  const health = center.workforceHealth;
  const rollup = center.executiveRollup;
  const mel = center.melOpportunities;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Workforce operations center</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Open call → applicant → hire → MEL assignment → project completion
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DataTrustBadge trust={trustInput} state={trustState} />
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[
          { label: "Open calls", value: health.openCalls },
          { label: "Filled calls", value: health.filledCalls },
          { label: "Coverage", value: `${health.coveragePercent}%` },
          { label: "Rep utilization", value: `${health.repUtilizationPercent}%` },
          { label: "Active reps", value: health.activeReps },
          { label: "New reps (30d)", value: health.newReps30Days },
          { label: "Inactive reps", value: health.inactiveReps },
          { label: "At-risk territories", value: health.atRiskTerritories },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-3"
          >
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-zinc-50">Executive rollup</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Metric label="Recruiting → MEL conversion" value={`${rollup.recruitingToMelConversionPercent}%`} />
            <Metric
              label="Avg time to fill"
              value={rollup.avgTimeToFillDays !== null ? `${rollup.avgTimeToFillDays}d` : "—"}
            />
            <Metric label="Workforce capacity" value={`${rollup.workforceCapacityScore}/100`} />
            <Metric label="MEL completion rate" value={`${mel.completionRatePercent}%`} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-1">Territory</th>
                  <th className="px-2 py-1">Fill rate</th>
                  <th className="px-2 py-1">Open</th>
                  <th className="px-2 py-1">Filled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                {rollup.territoryFillRates.slice(0, 6).map((row) => (
                  <tr key={row.dmName}>
                    <td className="px-2 py-1.5">{row.dmName}</td>
                    <td className="px-2 py-1.5">{row.fillRatePercent}%</td>
                    <td className="px-2 py-1.5">{row.openCalls}</td>
                    <td className="px-2 py-1.5">{row.filledCalls}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-zinc-50">MEL opportunity management</h3>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge label={`${mel.openByTerritory} open`} />
            <Badge label={`${mel.filled} filled`} />
            <Badge label={`${mel.aging} aging`} />
            <Badge label={`${mel.coverageGaps} gaps`} />
          </div>
          <div className="mt-3 max-h-64 overflow-y-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="text-zinc-500 uppercase">
                <tr>
                  <th className="px-2 py-1">Project</th>
                  <th className="px-2 py-1">State</th>
                  <th className="px-2 py-1">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
                {mel.rows.slice(0, 12).map((row) => (
                  <tr key={row.opportunityId}>
                    <td className="px-2 py-1.5">{row.projectName}</td>
                    <td className="px-2 py-1.5">{row.state}</td>
                    <td className="px-2 py-1.5 capitalize">{row.status.replace("-", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">Candidate → MEL pipeline</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2">Candidate</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Pipeline</th>
                <th className="px-2 py-2">Match</th>
                <th className="px-2 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {center.melPipeline.slice(0, 15).map((row) => (
                <tr key={row.candidateId}>
                  <td className="px-2 py-2">{row.candidateName}</td>
                  <td className="px-2 py-2 text-xs">{row.workflowStatus}</td>
                  <td className="px-2 py-2 text-xs">
                    {PIPELINE_STATUS_LABEL[row.pipelineStatus] ?? row.pipelineStatus}
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {row.topProjectName ? `${row.topProjectName} (${row.fitPercent ?? 0}%)` : "—"}
                  </td>
                  <td className="px-2 py-2">
                    {row.melReady && row.pipelineStatus !== "completed" ? (
                      <button
                        type="button"
                        disabled={pushingId === row.candidateId}
                        onClick={() => void pushToMel(row.candidateId, row.topOpportunityId)}
                        className="rounded border border-teal-600/40 px-2 py-1 text-xs text-teal-200 hover:bg-teal-500/10 disabled:opacity-50"
                      >
                        {pushingId === row.candidateId ? "Pushing…" : "Push to MEL"}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">Operations queue</h3>
        <ul className="mt-3 space-y-2">
          {center.operationsQueue.length === 0 ? (
            <li className="text-sm text-zinc-500">No open operations items.</li>
          ) : (
            center.operationsQueue.map((item) => (
              <li
                key={item.id}
                className={`rounded-lg border px-3 py-2 text-sm ${QUEUE_STYLES[item.severity]}`}
              >
                <span className="font-medium">{item.title}</span>
                <span className="text-zinc-400"> — </span>
                {item.detail}
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-zinc-50">Territory drilldowns</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2">DM</th>
                <th className="px-2 py-2">Recruiter</th>
                <th className="px-2 py-2">DM perf</th>
                <th className="px-2 py-2">MEL</th>
                <th className="px-2 py-2">Health</th>
                <th className="px-2 py-2">Open</th>
                <th className="px-2 py-2">Ready MEL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {center.territoryDrilldowns.map((row) => (
                <tr key={row.dmName}>
                  <td className="px-2 py-2 font-medium">{row.dmName}</td>
                  <td className="px-2 py-2">{row.recruiterPerformanceScore}%</td>
                  <td className="px-2 py-2">{row.dmPerformanceScore}%</td>
                  <td className="px-2 py-2">{row.melOpportunityScore}%</td>
                  <td className="px-2 py-2">{row.workforceHealthScore}%</td>
                  <td className="px-2 py-2">{row.openCalls}</td>
                  <td className="px-2 py-2">{row.readyForMel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showLegacyPanels ? (
        <DeferredSection
          title="Rep intelligence & staffing tools"
          description="Import roster, geocode reps, coverage risk, and staffing recommendations."
        >
          <WorkforceOperationsSection showPasswordPanel={showPasswordPanel} />
        </DeferredSection>
      ) : null}

      {meta?.refreshedAt ? (
        <p className="text-xs text-zinc-600">
          Refreshed {new Date(meta.refreshedAt).toLocaleString()}
          {meta.hasMelData === false ? " · MEL sheet unavailable" : ""}
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-zinc-300">{label}</span>
  );
}
