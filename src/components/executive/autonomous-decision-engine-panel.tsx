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
import type { DecisionDashboardSnapshot, DecisionSimulationResult } from "@/lib/autonomous-decision-engine/types";
import { useCallback, useEffect, useState } from "react";

function riskTone(risk: string): string {
  switch (risk) {
    case "low":
      return "text-emerald-300";
    case "medium":
      return "text-amber-300";
    case "high":
      return "text-orange-300";
    case "critical":
      return "text-red-300";
    default:
      return "text-zinc-400";
  }
}

export function AutonomousDecisionEnginePanel() {
  const [dashboard, setDashboard] = useState<DecisionDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<DecisionSimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-decision-engine", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: DecisionDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load decision engine");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? data.dashboard.warnings ?? []);
      setSimulation(null);
    } catch {
      setError("Failed to load decision engine");
    } finally {
      setLoading(false);
    }
  }, []);

  const simulate = useCallback(async (decisionId: string) => {
    setSimulating(true);
    try {
      const res = await fetch(`/api/autonomous-decision-engine?simulate=${encodeURIComponent(decisionId)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { simulation?: DecisionSimulationResult | null };
      setSimulation(data.simulation ?? null);
    } finally {
      setSimulating(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !dashboard) {
    return <ExecutivePanelLoading title="Autonomous Decision Engine" badge="Preview Mode" />;
  }

  if (error && !dashboard) {
    return (
      <ExecutivePanelError title="Autonomous Decision Engine" message={error} onRetry={() => void load()} />
    );
  }

  if (!dashboard) return null;

  const m = dashboard.executiveMetrics;

  return (
    <ExecutiveCard id="autonomous-decision-engine" variant="default" className="ring-1 ring-inset ring-violet-500/10">
      <SectionHeader
        title="Autonomous Decision Engine"
        badge="Preview Mode"
        badgeTone="neutral"
        subtitle="P76 decision brain · recommend, explain, prioritize — no production actions"
        actions={
          <ExecutiveButton onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </ExecutiveButton>
        }
      />

      {warnings.length > 0 ? (
        <div className="mt-5">
          <ExecutiveWarningList warnings={warnings} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total decisions" value={String(m.totalDecisions)} />
        <MetricCard label="Automation-ready" value={String(m.automationReadyDecisions)} />
        <MetricCard label="Human review" value={String(m.humanReviewDecisions)} />
        <MetricCard label="Avg confidence" value={m.averageConfidence != null ? `${m.averageConfidence}%` : "—"} />
        <MetricCard label="Avg risk score" value={m.averageRiskScore != null ? String(m.averageRiskScore) : "—"} />
        <MetricCard label="Recruiter hrs saved" value={String(m.recruiterHoursSaved)} />
        <MetricCard label="Blocked" value={String(dashboard.blockedDecisions.length)} />
        <MetricCard label="High confidence" value={String(dashboard.highConfidenceDecisions.length)} />
      </div>

      {m.highestValueRecommendation ? (
        <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] px-4 py-3 text-sm text-violet-100">
          <span className="font-semibold">Highest-value recommendation:</span> {m.highestValueRecommendation}
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Recommended decisions</h3>
          <ul className="mt-3 space-y-2">
            {dashboard.recommendedDecisions.slice(0, 6).map((d) => (
              <li key={d.decisionId} className="rounded-xl border border-zinc-800/35 bg-zinc-950/30 px-3.5 py-2.5 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-medium text-zinc-200">{d.decision}</span>
                  <span className="tabular-nums text-zinc-500">{d.confidence}%</span>
                </div>
                <p className="mt-1.5 leading-relaxed text-zinc-500">{d.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide">
                  <span className={riskTone(d.risk)}>{d.risk} risk</span>
                  <span className="text-zinc-500">{d.requiredEngine}</span>
                  {d.automationReady ? <span className="text-emerald-400">automation ready</span> : null}
                  {d.blocked ? <span className="text-red-400">blocked</span> : null}
                </div>
                <button
                  type="button"
                  disabled={simulating}
                  onClick={() => void simulate(d.decisionId)}
                  className="mt-2.5 rounded-lg border border-violet-500/30 px-2.5 py-1 text-[10px] font-medium text-violet-200 transition-colors hover:bg-violet-500/10 disabled:opacity-50"
                >
                  Simulate outcome
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Top opportunities</h3>
          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-400">
            {dashboard.topOpportunities.slice(0, 5).map((d) => (
              <li key={d.decisionId}>
                {d.decision} — saves ~{d.estimatedRecruiterTimeSavedMinutes} min
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-semibold text-zinc-300">Biggest risks</h3>
          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-400">
            {dashboard.biggestRisks.slice(0, 5).map((d) => (
              <li key={d.decisionId}>
                {d.decision} ({d.risk})
              </li>
            ))}
          </ul>
          {simulation ? (
            <div className="mt-5 rounded-xl border border-violet-500/20 bg-violet-950/20 px-3.5 py-3 text-xs text-zinc-300">
              <p className="font-semibold text-violet-200">Simulation: {simulation.decision}</p>
              <p className="mt-1.5 text-zinc-400">{simulation.estimatedImpact}</p>
              <p className="mt-3 font-medium text-zinc-300">Would execute (preview):</p>
              <ul className="mt-1 list-disc pl-4">
                {simulation.wouldExecute.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              <p className="mt-2 text-zinc-500">{simulation.auditNote}</p>
            </div>
          ) : null}
        </div>
      </div>
    </ExecutiveCard>
  );
}
