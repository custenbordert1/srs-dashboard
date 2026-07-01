"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import { CollapsibleSection } from "@/components/executive/ui/collapsible-section";
import {
  buildExecutiveCommandSummaryMetrics,
  enrichTopActions,
} from "@/lib/p120-executive-ui-cleanup/build-executive-action-summary";
import type {
  EnrichedTopAction,
  ExecutiveCommandSummaryMetrics,
} from "@/lib/p120-executive-ui-cleanup/types";
import type { AutonomousPaperworkOperationsCenterReport } from "@/lib/p118-autonomous-paperwork-operations-center/types";
import type { AutonomousRecoveryReport } from "@/lib/p119-autonomous-recovery-engine/types";
import { useCallback, useEffect, useState } from "react";

function statusTone(value: string): "success" | "warning" | "critical" | "neutral" {
  if (value === "GO" || value === "LIVE" || value === "SENDS ENABLED") return "success";
  if (value.includes("CONDITIONS")) return "warning";
  if (value === "NO-GO") return "critical";
  return "neutral";
}

function TopActionsList({ actions }: { actions: EnrichedTopAction[] }) {
  if (actions.length === 0) {
    return <p className="text-sm text-zinc-400">No prioritized recovery actions.</p>;
  }

  return (
    <div className="space-y-3">
      {actions.map((action, index) => (
        <div
          key={action.actionId}
          className="rounded-lg border border-zinc-700/60 bg-zinc-950/30 px-4 py-3"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500">#{index + 1}</span>
            <span className="font-medium text-zinc-100">{action.title}</span>
            <StatusBadge tone={action.businessImpact === "high" ? "warning" : "neutral"}>
              {`${action.businessImpact} impact`}
            </StatusBadge>
            <StatusBadge tone="neutral">{`priority ${action.priority}`}</StatusBadge>
          </div>
          <div className="grid gap-2 text-sm text-zinc-300 md:grid-cols-2">
            <div>Expected unlock: {action.expectedUnlockCount}</div>
            <div>Owner: {action.recommendedOwner}</div>
            <div className="md:col-span-2">Safety: {action.safetyStatus}</div>
          </div>
          <p className="mt-2 text-xs text-zinc-500">{action.reason}</p>
          {action.humanApprovalRequired ? (
            <p className="mt-2 text-xs font-medium text-amber-200">Human approval required</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function ExecutiveCommandSummaryPanel() {
  const [operations, setOperations] = useState<AutonomousPaperworkOperationsCenterReport | null>(null);
  const [recovery, setRecovery] = useState<AutonomousRecoveryReport | null>(null);
  const [metrics, setMetrics] = useState<ExecutiveCommandSummaryMetrics | null>(null);
  const [topActions, setTopActions] = useState<EnrichedTopAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [opsRes, recRes] = await Promise.all([
        fetch("/api/autonomous-paperwork-operations-center", { cache: "no-store" }),
        fetch("/api/autonomous-recovery", { cache: "no-store" }),
      ]);
      const opsData = (await opsRes.json()) as {
        ok?: boolean;
        autonomousPaperworkOperationsCenter?: AutonomousPaperworkOperationsCenterReport;
        error?: string;
      };
      const recData = (await recRes.json()) as {
        ok?: boolean;
        autonomousRecovery?: AutonomousRecoveryReport;
        error?: string;
      };
      if (!opsRes.ok || !opsData.ok || !opsData.autonomousPaperworkOperationsCenter) {
        setError(opsData.error ?? "Failed to load operations summary");
        return;
      }
      if (!recRes.ok || !recData.ok || !recData.autonomousRecovery) {
        setError(recData.error ?? "Failed to load recovery summary");
        return;
      }
      setOperations(opsData.autonomousPaperworkOperationsCenter);
      setRecovery(recData.autonomousRecovery);
      const built = buildExecutiveCommandSummaryMetrics({
        operations: opsData.autonomousPaperworkOperationsCenter,
        recovery: recData.autonomousRecovery,
      });
      setMetrics(built);
      setTopActions(enrichTopActions(recData.autonomousRecovery.actionQueue, 5));
    } catch {
      setError("Failed to load executive command summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <ExecutivePanelLoading title="Executive Command Summary" badge="P120" />;
  if (error || !metrics || !operations || !recovery) {
    return (
      <ExecutivePanelError
        title="Executive Command Summary"
        message={error ?? "No summary"}
        onRetry={load}
      />
    );
  }

  return (
    <ExecutiveCard id="executive-command-summary" variant="premium">
      <SectionHeader
        title="Executive Command Summary"
        subtitle="P120 — paperwork automation status at a glance"
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <StatusBadge tone={statusTone(metrics.automationLive)}>{metrics.automationLive}</StatusBadge>
        <StatusBadge tone={statusTone(metrics.paperworkSendingAutomatically)}>
          {metrics.paperworkSendingAutomatically}
        </StatusBadge>
        <StatusBadge tone={statusTone(metrics.goStatus)}>{metrics.goStatus}</StatusBadge>
        {metrics.humanApprovalRequired ? (
          <StatusBadge tone="warning">Human approval required</StatusBadge>
        ) : (
          <StatusBadge tone="success">No approval gate</StatusBadge>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Blocked candidates" value={metrics.totalBlockedCandidates.toLocaleString()} />
        <MetricCard
          label="Est. recoverable"
          value={metrics.estimatedRecoverableCandidates.toLocaleString()}
        />
        <MetricCard label="Approved mappings ready" value={metrics.approvedMappingsReady.toLocaleString()} />
        <MetricCard label="Pending mapping review" value={metrics.pendingMappingReviews.toLocaleString()} />
      </div>

      <div className="mb-6 rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm text-zinc-200">
        <span className="font-medium text-sky-100">Top recommended action: </span>
        {metrics.topRecommendedAction}
      </div>

      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Top 5 actions</h3>
      <TopActionsList actions={topActions} />

      <div className="mt-6">
        <CollapsibleSection
          title="Detailed recovery categories"
          subtitle="Distribution and impact simulation"
          defaultOpen={false}
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {recovery.recoveryDistribution.map((entry) => (
              <MetricCard
                key={entry.category}
                label={entry.category}
                value={`${entry.count} (${entry.estimatedUnlock} unlock)`}
              />
            ))}
          </div>
        </CollapsibleSection>
      </div>
    </ExecutiveCard>
  );
}
