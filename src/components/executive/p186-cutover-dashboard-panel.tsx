"use client";

import {
  LastUpdatedBadge,
  SectionDegradedBanner,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import {
  ExecutiveCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import type { P1867CutoverDashboard } from "@/lib/p186-7-lifecycle-cutover";
import { useCallback, useEffect, useState } from "react";

export function P186CutoverDashboardPanel() {
  const [dashboard, setDashboard] = useState<P1867CutoverDashboard | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recruiting/p186-lifecycle-cutover/status", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        enabled?: boolean;
        dashboard?: P1867CutoverDashboard;
        message?: string;
      };
      setEnabled(Boolean(data.enabled));
      setDashboard(data.dashboard ?? null);
      setMessage(data.message ?? null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load cutover dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <SectionLoadingCard title="P186 Cutover Readiness" badge="P186.7" />;
  }

  if (!enabled || !dashboard) {
    return (
      <ExecutiveCard>
        <SectionHeader
          title="P186 Cutover Readiness"
          subtitle="Controlled lifecycle cutover planning — flag off (idle)."
          badge="P186.7"
        />
        <p className="mt-3 text-sm text-zinc-400">
          Enable with <code className="text-zinc-300">P186_CUTOVER_DASHBOARD=1</code>. Read-only;
          does not freeze writers, authorize Stage 2+, or enable scheduling.
        </p>
        {message ? (
          <div className="mt-3">
            <SectionDegradedBanner message={message} />
          </div>
        ) : null}
      </ExecutiveCard>
    );
  }

  const parity = dashboard.shadowParity;
  const gatesOk = dashboard.readinessGates.ok;

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="P186 Cutover Readiness"
          subtitle="Stage planning, writer freeze readiness, shadow parity, and rollback posture. No destructive controls."
          badge="P186.7"
        />
        <div className="flex flex-wrap items-center gap-2">
          <LastUpdatedBadge at={dashboard.generatedAt} />
          <StatusBadge tone="neutral">{dashboard.currentCutoverStage}</StatusBadge>
          <StatusBadge tone={gatesOk ? "success" : "warning"}>
            {gatesOk ? "gates ok" : "gates blocked"}
          </StatusBadge>
          <StatusBadge tone="success">writers disabled: 0</StatusBadge>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
      </div>

      <p className="mt-4 text-sm text-zinc-300">
        Next: {dashboard.nextRequiredAction}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Stage" value={dashboard.currentCutoverStage.replace("stage_", "")} />
        <MetricCard label="Shadow match %" value={`${(parity.matchRate * 100).toFixed(1)}%`} />
        <MetricCard label="Critical mismatches" value={String(dashboard.criticalMismatches)} />
        <MetricCard label="Freeze-ready" value={String(dashboard.freezeReady.length)} />
        <MetricCard label="Freeze-blocked" value={String(dashboard.freezeBlocked.length)} />
        <MetricCard label="Active writers" value={String(dashboard.writersActive.length)} />
        <MetricCard label="Freeze-pending" value={String(dashboard.writersFreezePending.length)} />
        <MetricCard label="Frozen" value={String(dashboard.writersFrozen.length)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <StatusBadge tone={dashboard.p184P185Isolation ? "success" : "critical"}>
          P184/P185 isolation
        </StatusBadge>
        <StatusBadge tone="success">rollback plans ready</StatusBadge>
        <StatusBadge tone="neutral">max stage: {dashboard.maxImplementedStage}</StatusBadge>
      </div>

      {dashboard.freezeBlocked.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <h3 className="mb-2 text-sm font-medium text-zinc-200">Freeze blocked</h3>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2">Writer</th>
                <th className="px-2 py-2">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.freezeBlocked.slice(0, 12).map((row) => (
                <tr key={row.writerId} className="border-t border-zinc-800">
                  <td className="px-2 py-2 font-mono text-xs text-zinc-300">{row.writerId}</td>
                  <td className="px-2 py-2 text-zinc-400">{row.reasons.join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {dashboard.schedulerOverlaps.length > 0 ? (
        <p className="mt-4 text-xs text-zinc-500">
          Scheduler overlaps remaining: {dashboard.schedulerOverlaps.join(" · ")}
        </p>
      ) : null}
    </ExecutiveCard>
  );
}
