"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import { CollapsibleSection } from "@/components/executive/ui/collapsible-section";
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
        subtitle="P119 — recovery intelligence (actions surfaced in command summary)"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Recovery score (avg)"
          value={
            summary.recoveryTrend[0]
              ? summary.recoveryTrend[0].averageRecoveryScore.toLocaleString()
              : "—"
          }
        />
        <MetricCard
          label="Est. paperwork unlocked"
          value={summary.estimatedPaperworkUnlocked.toLocaleString()}
        />
        <MetricCard label="Blocked analyzed" value={report.recoveryCandidates.length.toLocaleString()} />
        <MetricCard label="Recoverable count" value={summary.recoveryTrend[0]?.recoverableCount.toLocaleString() ?? "0"} />
      </div>

      <CollapsibleSection
        title="Top recovery opportunities"
        subtitle="Highest-scoring unlock candidates"
        defaultOpen={false}
      >
        <div className="space-y-1 text-sm text-zinc-300">
          {summary.topRecoveryOpportunities.map((item) => (
            <div key={item.candidateId}>
              <span className="font-medium text-zinc-100">{item.candidateName}</span> — score{" "}
              {item.recoveryScore} · {item.recoveryCategory}
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <div className="mt-4">
        <CollapsibleSection
          title="Recovery distribution"
          subtitle="Category breakdown"
          defaultOpen={false}
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {summary.recoveryDistribution.map((entry) => (
              <MetricCard
                key={entry.category}
                label={entry.category}
                value={`${entry.count} (${entry.estimatedUnlock} unlock)`}
              />
            ))}
          </div>
        </CollapsibleSection>
      </div>

      <div className="mt-4">
        <CollapsibleSection title="Largest blockers" subtitle="Raw blocker breakdown" defaultOpen={false}>
          <div className="space-y-1 text-sm text-zinc-300">
            {summary.largestBlockers.map((blocker) => (
              <div key={blocker.blockerCategory}>
                {blocker.blockerCategory}: {blocker.count} candidate(s), unlock potential{" "}
                {blocker.estimatedUnlock}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </div>

      <div className="mt-4">
        <CollapsibleSection title="Impact simulation" defaultOpen={false}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
        </CollapsibleSection>
      </div>

      <div className="mt-4">
        <CollapsibleSection title="Verbose diagnostics" subtitle="Recommendations and warnings" defaultOpen={false}>
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-zinc-300">
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
        </CollapsibleSection>
      </div>
    </ExecutiveCard>
  );
}
