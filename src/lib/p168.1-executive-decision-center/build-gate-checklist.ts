import type { P167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import {
  estimateNextCycleSends,
  isDropboxThrottlingDetected,
  projectDropboxUsage,
} from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type { P168GateEvaluation } from "@/lib/p168-executive-approval/build-approval-recommendation";
import type { P1681GateCheckItem } from "@/lib/p168.1-executive-decision-center/types";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";

const TWO_MIN_MS = 2 * 60_000;
const READINESS_THRESHOLD = 80;

export function buildGateChecklist(
  ctx: P167SchedulerContext,
  gates: P168GateEvaluation,
): P1681GateCheckItem[] {
  const projected = projectDropboxUsage(estimateNextCycleSends(ctx));
  const lastLive = ctx.runner.recentCycles.find((c) => !c.dryRun);

  return [
    {
      id: "runner_healthy",
      label: "Runner healthy",
      pass: ctx.health.healthy && ctx.runner.currentStatus !== "running",
      detail: ctx.health.healthy ? null : "Dependency health check failed",
    },
    {
      id: "dropbox_healthy",
      label: "Dropbox healthy",
      pass: !isDropboxThrottlingDetected(ctx) && projected.withinBudget,
      detail: isDropboxThrottlingDetected(ctx)
        ? "Rate limiting or throttling detected"
        : !projected.withinBudget
          ? "Projected cycle exceeds API budget"
          : null,
    },
    {
      id: "duplicate_protection",
      label: "Duplicate protection enabled",
      pass: ctx.duplicateProtectionActive,
      detail: null,
    },
    {
      id: "queue_ready",
      label: "Queue ready",
      pass: ctx.queue.eligibleNow > 0 || estimateNextCycleSends(ctx) > 0,
      detail: ctx.queue.eligibleNow === 0 ? "No eligible candidates" : null,
    },
    {
      id: "readiness_threshold",
      label: "Readiness score above threshold",
      pass: ctx.readinessScore != null && ctx.readinessScore > READINESS_THRESHOLD,
      detail:
        ctx.readinessScore == null
          ? "Readiness score unavailable"
          : ctx.readinessScore <= READINESS_THRESHOLD
            ? `Score ${ctx.readinessScore} ≤ ${READINESS_THRESHOLD}`
            : null,
    },
    {
      id: "deferred_backlog",
      label: "Deferred reconciliation backlog acceptable",
      pass: ctx.monitorDeferredCount <= ctx.monitorBudget * 2,
      detail:
        ctx.monitorDeferredCount > ctx.monitorBudget * 2
          ? `${ctx.monitorDeferredCount} deferred (budget ${ctx.monitorBudget}/cycle)`
          : null,
    },
    {
      id: "processing_lock",
      label: "Processing lock clear",
      pass: !ctx.processingLockHeld,
      detail: ctx.processingLockHeld ? "Lock held by in-flight cycle" : null,
    },
    {
      id: "continuous_disabled",
      label: "Continuous mode disabled",
      pass: !ctx.continuousModeEnabled,
      detail: ctx.continuousModeEnabled ? "Continuous automation enabled" : null,
    },
    {
      id: "daemon_stopped",
      label: "Daemon stopped",
      pass: !ctx.daemonActive,
      detail: ctx.daemonActive ? "Production daemon running" : null,
    },
    {
      id: "last_cycle_success",
      label: "Last run completed successfully",
      pass: !lastLive || lastLive.errors === 0,
      detail: lastLive && lastLive.errors > 0 ? `${lastLive.errors} errors on last cycle` : null,
    },
    {
      id: "wait_window",
      label: "Minimum wait window satisfied",
      pass: ctx.timeSinceLastCycleMs == null || ctx.timeSinceLastCycleMs >= TWO_MIN_MS,
      detail:
        ctx.timeSinceLastCycleMs != null && ctx.timeSinceLastCycleMs < TWO_MIN_MS
          ? "Spacing since last batch not met"
          : null,
    },
    {
      id: "live_env_gate",
      label: "Live cycle env gate enabled",
      pass: isP154ControlledProductionAutopilotEnabled(),
      detail: !isP154ControlledProductionAutopilotEnabled()
        ? "P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED not true"
        : null,
    },
    {
      id: "all_gates",
      label: "All approval gates pass",
      pass: gates.pass,
      detail: gates.pass ? null : gates.blockingFactors[0] ?? "Gate evaluation failed",
    },
  ];
}

export function resolveApproveDisabledReason(input: {
  action: string;
  gatesPass: boolean;
  checklist: P1681GateCheckItem[];
  blockingFactors: string[];
}): string | null {
  if (input.action === "RUN_NEXT_BATCH" && input.gatesPass) return null;
  if (input.action !== "RUN_NEXT_BATCH") {
    return `Current recommendation is ${input.action.replace(/_/g, " ").toLowerCase()} — approval not available.`;
  }
  const failed = input.checklist.filter((c) => !c.pass);
  if (failed.length > 0) {
    return failed[0]!.detail ?? failed[0]!.label;
  }
  return input.blockingFactors[0] ?? "Approval gates not satisfied";
}

export function resolveActionRequiredBeforeApproval(checklist: P1681GateCheckItem[]): string | null {
  const failed = checklist.filter((c) => !c.pass && c.id !== "all_gates");
  if (failed.length === 0) return null;
  return failed.map((f) => f.detail ?? f.label).join("; ");
}
