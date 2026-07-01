"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { AutonomousRecoveryReport } from "@/lib/p119-autonomous-recovery-engine/types";
import { useCallback, useEffect, useState } from "react";

export function AutonomousRecoveryCenterPanel() {
  const [report, setReport] = useState<AutonomousRecoveryReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-recovery", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        autonomousRecovery?: AutonomousRecoveryReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.autonomousRecovery) {
        setError(data.error ?? "Failed to load recovery center");
        return;
      }
      setReport(data.autonomousRecovery);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load recovery center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <ExecutivePanelLoading title="Autonomous Recovery Center" badge="P119" />;
  if (error || !report) {
    return (
      <ExecutivePanelError
        title="Autonomous Recovery Center"
        message={error ?? "No report"}
        onRetry={load}
      />
    );
  }

  const summary = report.executiveSummary;

  return (
    <ExecutiveCard id="autonomous-recovery-center">
      <SectionHeader
        title="Autonomous Recovery Center"
        subtitle="P119 — intelligence layer only (no sends, no writes)"
      />

      <div className="mb-4 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              report.goNoGo === "GO"
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-rose-500/20 text-rose-200"
            }`}
          >
            {report.goNoGo}
          </span>
          <span className="text-sm text-zinc-300">{report.goNoGoReason}</span>
        </div>
        <p className="mt-2 text-sm text-zinc-400">{report.summary}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Est. paperwork unlocked"
          value={summary.estimatedPaperworkUnlocked.toLocaleString()}
        />
        <MetricCard
          label="Recruiter hours saved"
          value={summary.estimatedRecruiterHoursSaved.toLocaleString()}
        />
        <MetricCard label="Blocked analyzed" value={report.recoveryCandidates.length.toLocaleString()} />
        <MetricCard label="Action queue" value={report.actionQueue.length.toLocaleString()} />
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Highest impact actions
      </h3>
      <div className="mb-6 space-y-2">
        {summary.highestImpactActions.slice(0, 5).map((action) => (
          <div
            key={action.actionId}
            className="rounded-lg border border-zinc-700/50 px-3 py-2 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-zinc-100">{action.actionType}</span>
              <span className="text-xs text-zinc-400">priority {action.priority}</span>
              <span className="text-xs text-emerald-300">
                unlock {action.expectedUnlockCount}
              </span>
            </div>
            <p className="text-zinc-300">{action.reason}</p>
          </div>
        ))}
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Top recovery opportunities
      </h3>
      <div className="mb-6 space-y-1 text-sm text-zinc-300">
        {summary.topRecoveryOpportunities.slice(0, 10).map((item) => (
          <div key={item.candidateId}>
            <span className="font-medium text-zinc-100">{item.candidateName}</span> — score{" "}
            {item.recoveryScore} · {item.recoveryCategory} · {item.recommendedNextAction}
          </div>
        ))}
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Recovery distribution
      </h3>
      <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-3">
        {summary.recoveryDistribution.map((entry) => (
          <MetricCard
            key={entry.category}
            label={entry.category}
            value={`${entry.count} (${entry.estimatedUnlock} unlock)`}
          />
        ))}
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Impact simulation
      </h3>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard
          label="Top 5 actions"
          value={report.impactSimulation.top5.expectedPaperworkUnlocked.toLocaleString()}
        />
        <MetricCard
          label="Top 10 actions"
          value={report.impactSimulation.top10.expectedPaperworkUnlocked.toLocaleString()}
        />
        <MetricCard
          label="All recoverable"
          value={report.impactSimulation.allRecoverable.expectedPaperworkUnlocked.toLocaleString()}
        />
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Largest blockers
      </h3>
      <div className="mb-6 space-y-1 text-sm text-zinc-300">
        {summary.largestBlockers.slice(0, 5).map((blocker) => (
          <div key={blocker.blockerCategory}>
            {blocker.blockerCategory}: {blocker.count} candidate(s), unlock potential{" "}
            {blocker.estimatedUnlock}
          </div>
        ))}
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Recommended actions
      </h3>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-zinc-300">
        {report.topRecommendations.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
