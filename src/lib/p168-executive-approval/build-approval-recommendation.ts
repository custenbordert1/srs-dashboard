import { randomUUID } from "node:crypto";
import type { P167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler/types";
import type {
  P168ApprovalAction,
  P168ApprovalRecommendation,
  P168RiskLevel,
} from "@/lib/p168-executive-approval/approval-types";
import type { P167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import {
  estimateNextCycleSends,
  isDropboxThrottlingDetected,
  projectDropboxUsage,
} from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";

const TWO_MIN_MS = 2 * 60_000;
const READINESS_THRESHOLD = 80;

export type P168GateEvaluation = {
  pass: boolean;
  blockingFactors: string[];
};

export function evaluateRunNextBatchGates(ctx: P167SchedulerContext): P168GateEvaluation {
  const blockingFactors: string[] = [];
  const projected = projectDropboxUsage(estimateNextCycleSends(ctx));

  if (ctx.runner.currentStatus === "running") {
    blockingFactors.push("Runner is currently running");
  }
  if (ctx.processingLockHeld) {
    blockingFactors.push("Processing lock is held");
  }
  if (ctx.continuousModeEnabled) {
    blockingFactors.push("Continuous mode is enabled");
  }
  if (ctx.daemonActive) {
    blockingFactors.push("Production daemon is active");
  }
  if (!projected.withinBudget) {
    blockingFactors.push("Dropbox API budget would be exceeded");
  }
  if (isDropboxThrottlingDetected(ctx)) {
    blockingFactors.push("Dropbox Sign throttling detected");
  }
  if (!ctx.duplicateProtectionActive) {
    blockingFactors.push("Duplicate protection is disabled");
  }
  if (ctx.readinessScore == null || ctx.readinessScore <= READINESS_THRESHOLD) {
    blockingFactors.push(
      ctx.readinessScore == null
        ? "Production readiness score unavailable"
        : `Production readiness score ${ctx.readinessScore} is below ${READINESS_THRESHOLD}`,
    );
  }
  if (ctx.queue.eligibleNow === 0 && estimateNextCycleSends(ctx) === 0) {
    blockingFactors.push("No eligible candidates in queue");
  }
  const lastLive = ctx.runner.recentCycles.find((c) => !c.dryRun);
  if (lastLive && lastLive.errors > 0) {
    blockingFactors.push("Last production cycle completed with errors");
  }
  if (ctx.timeSinceLastCycleMs != null && ctx.timeSinceLastCycleMs < TWO_MIN_MS) {
    blockingFactors.push("Minimum wait window since last cycle not satisfied");
  }
  if (!isP154ControlledProductionAutopilotEnabled()) {
    blockingFactors.push("P154 controlled production autopilot env gate is not enabled");
  }
  if (!ctx.health.healthy) {
    blockingFactors.push("Runner health check failed");
  }

  return { pass: blockingFactors.length === 0, blockingFactors };
}

function riskFromFactors(
  action: P168ApprovalAction,
  blockingFactors: string[],
  scheduler: P167ProductionSchedulerReport,
): P168RiskLevel {
  if (action === "HOLD_INVESTIGATION") return "high";
  if (action === "RUN_NEXT_BATCH" && blockingFactors.length === 0) {
    if (scheduler.context.dropboxThrottlingDetected || scheduler.context.todayFailures > 0) {
      return "medium";
    }
    return "low";
  }
  if (blockingFactors.length >= 3) return "high";
  if (blockingFactors.length > 0) return "medium";
  return "low";
}

function titleForAction(action: P168ApprovalAction): string {
  const titles: Record<P168ApprovalAction, string> = {
    WAIT: "Wait before next batch",
    RUN_NEXT_BATCH: "Approve & run next batch",
    HOLD_INVESTIGATION: "Hold for investigation",
    NO_ACTION_REQUIRED: "No action required",
  };
  return titles[action];
}

function mapSchedulerToAction(
  scheduler: P167ProductionSchedulerReport,
  gates: P168GateEvaluation,
): P168ApprovalAction {
  const rec = scheduler.decision.recommendation;

  if (rec === "PAUSE_INVESTIGATION_REQUIRED") return "HOLD_INVESTIGATION";
  if (rec === "NO_ELIGIBLE_CANDIDATES") return "NO_ACTION_REQUIRED";

  if (rec === "READY_NOW" && gates.pass) return "RUN_NEXT_BATCH";

  if (gates.blockingFactors.some((f) => f.includes("investigation") || f.includes("throttling"))) {
    return "HOLD_INVESTIGATION";
  }

  return "WAIT";
}

export function buildApprovalRecommendation(input: {
  scheduler: P167ProductionSchedulerReport;
  ctx: P167SchedulerContext;
}): P168ApprovalRecommendation {
  const { scheduler, ctx } = input;
  const gates = evaluateRunNextBatchGates(ctx);
  const action = mapSchedulerToAction(scheduler, gates);
  const expectedSends = scheduler.decision.estimatedCandidatesNextCycle;
  const expectedDropboxApiRequests = scheduler.decision.projectedDropboxApiUsage.totalRequests;
  const expectedQueueReduction = Math.min(expectedSends, scheduler.context.queueRemaining);

  const estimatedDurationMs =
    ctx.runner.averageCycleDurationMs ??
    ctx.runner.recentCycles.find((c) => !c.dryRun)?.durationMs ??
    null;

  let reason = scheduler.decision.reason;
  if (action === "RUN_NEXT_BATCH") {
    reason = `All safety gates pass. Scheduler recommends immediate capped batch (${expectedSends} sends max).`;
  } else if (action === "WAIT") {
    reason = `Scheduler: ${scheduler.decision.recommendation}. ${scheduler.decision.reason}`;
  } else if (action === "HOLD_INVESTIGATION") {
    reason = scheduler.decision.reason;
  } else if (action === "NO_ACTION_REQUIRED") {
    reason = "No eligible candidates — queue does not require a production batch.";
  }

  const blockingFactors =
    action === "RUN_NEXT_BATCH" ? [] : [...new Set([...gates.blockingFactors, ...(scheduler.decision.limitingFactor ? [scheduler.decision.limitingFactor] : [])])];

  const confidence =
    action === "RUN_NEXT_BATCH"
      ? Math.min(98, scheduler.decision.confidence + 2)
      : action === "HOLD_INVESTIGATION"
        ? scheduler.decision.confidence
        : Math.max(60, scheduler.decision.confidence - 5);

  return {
    id: `p168-${randomUUID()}`,
    action,
    title: titleForAction(action),
    reason,
    confidence,
    expectedSends,
    expectedDropboxApiRequests,
    expectedQueueReduction,
    estimatedDurationMs,
    blockingFactors,
    riskLevel: riskFromFactors(action, blockingFactors, scheduler),
    requiredApprovals: action === "RUN_NEXT_BATCH" ? ["executive"] : [],
    schedulerRecommendation: scheduler.decision.recommendation,
    generatedAt: new Date().toISOString(),
  };
}
