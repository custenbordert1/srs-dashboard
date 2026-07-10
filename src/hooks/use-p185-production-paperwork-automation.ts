"use client";

import { useCallback, useEffect, useState } from "react";
import type { P185HealthReport } from "@/lib/p185-production-paperwork-automation-runner/types";
import type { P185OperatorAction } from "@/lib/p185-production-paperwork-automation-runner/operator";

type DashboardPayload = {
  scheduler: string;
  automationMode: string;
  lastCycle: P185HealthReport["lastAttemptedCycle"];
  lastSuccessfulLiveSend: string | null;
  nextExpectedRun: string | null;
  leaseStatus: P185HealthReport["lease"];
  queueDepth: number;
  eligibleNow: number;
  sentToday: number;
  confirmedToday: number;
  failedToday: number;
  unverifiedSends: number;
  retryBacklog: number;
  circuitBreaker: P185HealthReport["circuitBreaker"];
  storageHealth: P185HealthReport["storage"];
  breezyHealth: P185HealthReport["breezySource"];
  dropboxSignHealth: P185HealthReport["dropboxSign"];
  killSwitch: boolean;
  pauseUntil: string | null;
  existingPacketsActive?: number;
  awaitingSignature?: number;
  signedCompleted?: number;
  eligibleNewPackets?: number;
  replacementReview?: number;
  awaitingHiringApproval?: number;
  unresolvedJobMappings?: number;
  jobMappingCoveragePct?: number | null;
  appliedNotSelected?: number;
  estimatedBacklogClearanceMinutes?: number;
  recoveryLastRunAt?: string | null;
  selectionEvidenceFound?: number;
  verifiedSelectedCandidates?: number;
  readyForPaperwork?: number;
  templateBlocked?: number;
  selectedUnresolvedJobs?: number;
  needsOperatorConfirmation?: number;
  p1852QueueDepth?: number;
  p1852ProjectedClearanceMinutes?: number;
  p1852LastRunAt?: string | null;
  p1853?: {
    rolloutId: string | null;
    approvedCohort: number;
    stillEligible: number;
    canaryQueued: number;
    canarySent: number;
    canaryConfirmed: number;
    remainingBacklog: number;
    currentCycle: number;
    nextScheduledCycle: string | null;
    nextScheduledAction: string | null;
    sentToday: number;
    confirmedToday: number;
    sentUnverified: number;
    failed: number;
    blockedAfterApproval: number;
    duplicatesPrevented: number;
    circuitBreaker: string;
    killSwitch: boolean;
    storageHealth: string;
    dropboxSignHealth: string;
    schedulerHealth: string;
    phase: string;
  };
};

type ApiResponse = {
  ok: boolean;
  health?: P185HealthReport;
  dashboard?: DashboardPayload;
  error?: string;
};

export function useP185ProductionPaperworkAutomation() {
  const [health, setHealth] = useState<P185HealthReport | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/p185-production-paperwork-automation");
      const body = (await res.json()) as ApiResponse;
      if (!res.ok || !body.ok) {
        setError(body.error ?? `Request failed (${res.status})`);
        return;
      }
      setHealth(body.health ?? null);
      setDashboard(body.dashboard ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load P185 status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (action: P185OperatorAction, confirmed = false) => {
      setActing(true);
      setError(null);
      try {
        const res = await fetch("/api/p185-production-paperwork-automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, confirmed }),
        });
        const body = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !body.ok) {
          setError(body.error ?? `Action failed (${res.status})`);
          return false;
        }
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "P185 action failed");
        return false;
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

  const runP1853Action = useCallback(
    async (action: string, confirmed = false) => {
      setActing(true);
      setError(null);
      try {
        const res = await fetch("/api/p185-production-paperwork-automation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, confirmed, scope: "p1853" }),
        });
        const body = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !body.ok) {
          setError(body.error ?? `P185.3 action failed (${res.status})`);
          return false;
        }
        await refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "P185.3 action failed");
        return false;
      } finally {
        setActing(false);
      }
    },
    [refresh],
  );

  return {
    health,
    dashboard,
    loading,
    acting,
    error,
    refresh,
    pause: () => runAction("pause", true),
    resume: () => runAction("resume", true),
    activateKillSwitch: () => runAction("kill_switch_on", true),
    clearKillSwitch: () => runAction("kill_switch_off", true),
    openCircuit: () => runAction("circuit_open", true),
    resetCircuit: () => runAction("circuit_reset", true),
    runDryRun: () => runAction("dry_run_cycle", false),
    runLiveCycle: () => runAction("live_cycle", true),
    reconcile: () => runAction("reconcile", false),
    p1853FinalDryRun: () => runP1853Action("final_dry_run", false),
    p1853StartCanary: () => runP1853Action("start_canary", true),
    p1853PauseRollout: () => runP1853Action("pause_rollout", true),
    p1853ResumeAfterCanary: () => runP1853Action("resume_after_canary", true),
    p1853ReleaseBacklog: () => runP1853Action("release_backlog_cycle", true),
    p1853KillSwitchOn: () => runP1853Action("kill_switch_on", true),
    p1853ResetCircuit: () => runP1853Action("reset_circuit", true),
    p1853Reconcile: () => runP1853Action("reconcile_envelopes", false),
    p1853CancelRemaining: () => runP1853Action("cancel_remaining_unsent", true),
  };
}
