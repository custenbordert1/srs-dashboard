"use client";

import {
  ExecutiveButton,
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { GovernanceDashboardSnapshot } from "@/lib/autonomous-approval-governance/types";
import { useCallback, useEffect, useState } from "react";

function approvalLabel(level: string): string {
  return level.replace(/_/g, " ");
}

function statusTone(status: string): string {
  switch (status) {
    case "healthy":
      return "text-emerald-300";
    case "warning":
      return "text-amber-300";
    case "critical":
      return "text-red-300";
    default:
      return "text-zinc-400";
  }
}

export function AutonomousApprovalGovernancePanel() {
  const [dashboard, setDashboard] = useState<GovernanceDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-approval-governance", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: GovernanceDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load governance engine");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? data.dashboard.warnings ?? []);
    } catch {
      setError("Failed to load governance engine");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !dashboard) {
    return <ExecutivePanelLoading title="Autonomous Approval & Governance" badge="Preview Mode" />;
  }

  if (error && !dashboard) {
    return (
      <ExecutivePanelError
        title="Autonomous Approval & Governance"
        message={error}
        onRetry={() => void load()}
      />
    );
  }

  if (!dashboard) return null;

  const m = dashboard.executiveMetrics;
  const health = dashboard.governanceHealth;

  return (
    <ExecutiveCard id="autonomous-approval-governance" variant="accent">
      <SectionHeader
        title="Autonomous Approval & Governance"
        badge="Preview Mode"
        badgeTone="info"
        subtitle="P77 governance · evaluate permissions — no approval mutations or execution"
        actions={
          <ExecutiveButton onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </ExecutiveButton>
        }
      />

      <div className="mt-5 flex flex-wrap gap-3 text-xs text-zinc-300">
        <span className={`font-semibold uppercase ${statusTone(health.status)}`}>Governance: {health.status}</span>
        <span>{health.summary}</span>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-5">
          <ExecutiveWarningList warnings={warnings} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Reviewed" value={String(m.totalDecisionsReviewed)} />
        <MetricCard label="Auto approved" value={String(m.autoApproved)} />
        <MetricCard label="Recruiter approval" value={String(m.recruiterApprovalRequired)} />
        <MetricCard label="DM approval" value={String(m.dmApprovalRequired)} />
        <MetricCard label="Executive approval" value={String(m.executiveApprovalRequired)} />
        <MetricCard label="Blocked" value={String(m.blockedByPolicy)} />
        <MetricCard label="Pilot eligible" value={String(m.pilotEligibleActions)} />
        <MetricCard label="Hrs saved (est.)" value={String(m.estimatedRecruiterTimeSaved)} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Approval queue (preview)</h3>
          <ul className="mt-3 space-y-2">
            {dashboard.approvalQueue.slice(0, 6).map((item) => (
              <li key={item.decisionId} className="rounded-xl border border-zinc-800/35 bg-zinc-950/30 px-3.5 py-2.5 text-xs">
                <div className="font-medium text-zinc-200">{item.recommendedAction}</div>
                <p className="mt-1.5 text-zinc-500">
                  {item.candidateName ?? "Platform"} · {approvalLabel(item.approvalLevel)}
                </p>
                <p className="mt-1 text-zinc-500">{item.reason}</p>
                <p className="mt-1.5 text-[10px] uppercase text-zinc-600">
                  {item.confidence}% confidence · saves ~{item.timeSavedMinutesIfApproved} min
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Blocked by policy</h3>
          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-400">
            {dashboard.blockedByPolicy.slice(0, 5).map((d) => (
              <li key={d.decisionId}>
                {d.decision} — {d.governanceReason}
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-semibold text-zinc-300">Policy registry</h3>
          <ul className="mt-3 space-y-1.5 text-xs text-zinc-500">
            {dashboard.policies.slice(0, 6).map((p) => (
              <li key={p.id}>
                <span className="text-zinc-300">{p.label}</span>
                {p.threshold ? ` (${p.threshold})` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ExecutiveCard>
  );
}
