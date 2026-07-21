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
import type { P187CutoverDashboard } from "@/lib/p187-hr-to-oa-canary";
import { useCallback, useEffect, useState } from "react";

export function P187CutoverStatusPanel() {
  const [dashboard, setDashboard] = useState<P187CutoverDashboard | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recruiting/p187-hr-to-oa-canary/status", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        enabled?: boolean;
        dashboard?: P187CutoverDashboard;
        message?: string;
      };
      setEnabled(Boolean(data.enabled));
      setDashboard(data.dashboard ?? null);
      setMessage(data.message ?? null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load P187 canary status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <SectionLoadingCard title="P187 Executive Cutover Status" badge="P187" />;
  }

  if (!enabled || !dashboard) {
    return (
      <ExecutiveCard>
        <SectionHeader
          title="P187 Executive Cutover Status"
          subtitle="Hiring Recommendation → Operator Approved canary — flag off (idle)."
          badge="P187"
        />
        <p className="mt-3 text-sm text-zinc-400">
          Enable with <code className="text-zinc-300">P187_CANARY_DASHBOARD=1</code>. Read-only.
          Production canary is not executed until explicit operator approval.
        </p>
        {message ? (
          <div className="mt-3">
            <SectionDegradedBanner message={message} />
          </div>
        ) : null}
      </ExecutiveCard>
    );
  }

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="P187 Executive Cutover Status"
          subtitle="Single-transition canary: Hiring Recommendation → Operator Approved. No paperwork, MEL, or other stage cutovers."
          badge="P187"
        />
        <div className="flex flex-wrap items-center gap-2">
          <LastUpdatedBadge at={dashboard.generatedAt} />
          <StatusBadge tone="neutral">{dashboard.canaryStatus}</StatusBadge>
          <StatusBadge tone={dashboard.rollbackReadiness ? "success" : "warning"}>
            {`rollback ${dashboard.rollbackReadiness ? "ready" : "blocked"}`}
          </StatusBadge>
          <StatusBadge tone="success">prod canary: not executed</StatusBadge>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Evaluated" value={String(dashboard.candidatesEvaluated)} />
        <MetricCard label="Transitioned" value={String(dashboard.candidatesTransitioned)} />
        <MetricCard
          label="Success rate"
          value={`${(dashboard.successRate * 100).toFixed(0)}%`}
        />
        <MetricCard label="Mismatches" value={String(dashboard.mismatches)} />
      </div>

      <div className="mt-4 space-y-2 text-sm text-zinc-300">
        <p>
          <span className="text-zinc-500">Legacy owner:</span> {dashboard.legacyOwner}
        </p>
        <p>
          <span className="text-zinc-500">P186 owner:</span> {dashboard.p186Owner}
        </p>
        <p>
          <span className="text-zinc-500">Audit:</span> {dashboard.auditStatus}
        </p>
        <p>
          <span className="text-zinc-500">Stop reason:</span>{" "}
          {dashboard.stopReason ?? "—"}
        </p>
      </div>
    </ExecutiveCard>
  );
}
