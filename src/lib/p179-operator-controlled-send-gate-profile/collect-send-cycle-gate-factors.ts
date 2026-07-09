import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import type { P168ApprovalAction } from "@/lib/p168-executive-approval/approval-types";
import {
  estimateNextCycleSends,
  isDropboxThrottlingDetected,
  projectDropboxUsage,
  type P167SchedulerContext,
} from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type { P167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler/types";
import type { SendCycleGateFactor } from "@/lib/p179-operator-controlled-send-gate-profile/types";

const TWO_MIN_MS = 2 * 60_000;
const DEFAULT_READINESS_THRESHOLD = 80;

export function collectSendCycleGateFactors(input: {
  ctx: P167SchedulerContext;
  scheduler: P167ProductionSchedulerReport;
  approvalAction: P168ApprovalAction;
  readinessThreshold?: number;
}): SendCycleGateFactor[] {
  const { ctx, scheduler, approvalAction } = input;
  const readinessThreshold = input.readinessThreshold ?? DEFAULT_READINESS_THRESHOLD;
  const factors: SendCycleGateFactor[] = [];
  const projected = projectDropboxUsage(estimateNextCycleSends(ctx));

  if (ctx.runner.currentStatus === "running") {
    factors.push({ id: "runner_running", message: "Runner is currently running" });
  }
  if (ctx.processingLockHeld) {
    factors.push({ id: "processing_lock_held", message: "Processing lock is held" });
  }
  if (ctx.continuousModeEnabled) {
    factors.push({ id: "continuous_mode_enabled", message: "Continuous mode is enabled" });
  }
  if (ctx.daemonActive) {
    factors.push({ id: "daemon_active", message: "Production daemon is active" });
  }
  if (!projected.withinBudget) {
    factors.push({ id: "dropbox_budget_exceeded", message: "Dropbox API budget would be exceeded" });
  }
  if (isDropboxThrottlingDetected(ctx)) {
    factors.push({ id: "dropbox_throttling", message: "Dropbox Sign throttling detected" });
  }
  if (!ctx.duplicateProtectionActive) {
    factors.push({
      id: "duplicate_protection_disabled",
      message: "Duplicate protection is disabled",
    });
  }
  if (ctx.readinessScore == null) {
    factors.push({
      id: "production_readiness_unavailable",
      message: "Production readiness score unavailable",
    });
  } else if (ctx.readinessScore <= readinessThreshold) {
    factors.push({
      id: "production_readiness_below_threshold",
      message: `Production readiness score ${ctx.readinessScore} is below ${readinessThreshold}`,
    });
  }
  if (ctx.queue.eligibleNow === 0 && estimateNextCycleSends(ctx) === 0) {
    factors.push({ id: "no_eligible_candidates", message: "No eligible candidates in queue" });
  }
  const lastLive = ctx.runner.recentCycles.find((c) => !c.dryRun);
  if (lastLive && lastLive.errors > 0) {
    factors.push({ id: "last_cycle_errors", message: "Last production cycle completed with errors" });
  }
  if (ctx.timeSinceLastCycleMs != null && ctx.timeSinceLastCycleMs < TWO_MIN_MS) {
    factors.push({
      id: "min_wait_since_last_cycle",
      message: "Minimum wait window since last cycle not satisfied",
    });
  }
  if (!isP154ControlledProductionAutopilotEnabled()) {
    factors.push({
      id: "p154_env_disabled",
      message: "P154 controlled production autopilot env gate is not enabled",
    });
  }
  if (!ctx.health.healthy) {
    factors.push({ id: "runner_unhealthy", message: "Runner health check failed" });
  }
  const dropboxUnhealthy = ctx.health.checks.some(
    (c) => c.id === "dropbox_sign_api" && c.status === "unhealthy",
  );
  if (dropboxUnhealthy) {
    factors.push({ id: "dropbox_unhealthy", message: "Dropbox Sign health check failed" });
  }

  const schedulerReady = scheduler.decision.recommendation === "READY_NOW";
  if (!schedulerReady) {
    factors.push({
      id: "scheduler_not_ready",
      message: `Scheduler recommends ${scheduler.decision.recommendation}`,
    });
  }

  if (approvalAction !== "RUN_NEXT_BATCH") {
    factors.push({
      id: "executive_not_approved",
      message: `Executive approval recommendation is ${approvalAction}`,
    });
  }

  return factors;
}
