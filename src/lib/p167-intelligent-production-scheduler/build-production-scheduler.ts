import {
  addMinutes,
  P167_DROPBOX_CYCLE_BUDGET,
  P167_LOW_RATE_LIMIT_REMAINING_THRESHOLD,
  waitRecommendationForMinutes,
} from "@/lib/p167-intelligent-production-scheduler/constants";
import {
  auditInconsistencyDetected,
  estimateNextCycleSends,
  gatherP167SchedulerContext,
  isDropboxThrottlingDetected,
  projectDropboxUsage,
  recentCycleFailureStreak,
  recruitersAvailable,
  type P167SchedulerContext,
} from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type {
  P167ProductionSchedulerReport,
  P167SchedulerDecision,
  P167SchedulerRecommendation,
} from "@/lib/p167-intelligent-production-scheduler/types";
import { buildP167CycleTimeline } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import { buildP167Simulations } from "@/lib/p167-intelligent-production-scheduler/simulate-scheduler";
import { P167_SOURCE_PHASE } from "@/lib/p167-intelligent-production-scheduler/types";

const TWO_MIN_MS = 2 * 60_000;
const FIVE_MIN_MS = 5 * 60_000;
const TEN_MIN_MS = 10 * 60_000;
const FIFTEEN_MIN_MS = 15 * 60_000;

function workflowErrorsIncreasing(ctx: P167SchedulerContext): boolean {
  const live = ctx.runner.recentCycles.filter((c) => !c.dryRun);
  if (live.length < 4) return false;
  const recent = live.slice(0, 3).reduce((s, c) => s + c.errors, 0);
  const prior = live.slice(3, 6).reduce((s, c) => s + c.errors, 0);
  return recent > prior && recent > 0;
}

function runnerUnhealthy(ctx: P167SchedulerContext): boolean {
  return !ctx.health.healthy || ctx.health.overallStatus === "unhealthy";
}

function readyNowBlocked(ctx: P167SchedulerContext, projected: ReturnType<typeof projectDropboxUsage>): string | null {
  if (ctx.processingLockHeld) return "processing_lock";
  if (ctx.daemonActive) return "daemon_active";
  if (ctx.continuousModeEnabled) return "continuous_mode_enabled";
  if (!projected.withinBudget) return "dropbox_api_budget";
  if (runnerUnhealthy(ctx)) return "runner_unhealthy";
  if (!ctx.duplicateProtectionActive) return "duplicate_protection_disabled";
  return null;
}

function computeWaitMinutes(ctx: P167SchedulerContext, projected: ReturnType<typeof projectDropboxUsage>): number {
  const since = ctx.timeSinceLastCycleMs ?? Infinity;

  if (isDropboxThrottlingDetected(ctx)) return 15;
  if (
    ctx.dropbox.rateLimitRemaining != null &&
    ctx.dropbox.rateLimitRemaining <= P167_LOW_RATE_LIMIT_REMAINING_THRESHOLD
  ) {
    return 5;
  }
  if (since < TWO_MIN_MS) return 2;
  if (since < FIVE_MIN_MS) return 5;
  if (ctx.monitorDeferredCount > ctx.monitorBudget * 2) return 10;
  if (ctx.readinessScore != null && ctx.readinessScore < 70) return 10;
  if (since < TEN_MIN_MS) return 10;
  if (since < FIFTEEN_MIN_MS) return 15;
  return 2;
}

function limitingFactorLabel(key: string | null): string | null {
  if (!key) return null;
  const labels: Record<string, string> = {
    processing_lock: "Processing lock held",
    daemon_active: "Daemon actively running",
    continuous_mode_enabled: "Continuous mode enabled",
    dropbox_api_budget: "Projected Dropbox API exceeds cycle budget",
    runner_unhealthy: "Runner or dependency health check failed",
    duplicate_protection_disabled: "Duplicate protection disabled",
    no_eligible_candidates: "No eligible candidates in pipeline",
    dropbox_throttling: "Dropbox Sign rate limiting detected",
    repeated_cycle_failures: "Repeated production cycle failures",
    workflow_errors_increasing: "Workflow errors trending upward",
    audit_inconsistency: "Audit inconsistency between runner and send log",
    spacing_since_last_cycle: "Minimum spacing since last production cycle",
    rate_limit_headroom: "Low Dropbox rate-limit headroom",
    deferred_reconciliation_backlog: "Deferred reconciliation backlog",
    production_readiness: "Production readiness score below threshold",
    recruiter_capacity: "Recruiter assignment capacity",
  };
  return labels[key] ?? key;
}

function buildDecision(ctx: P167SchedulerContext): P167SchedulerDecision {
  const estimatedSends = estimateNextCycleSends(ctx);
  const projected = projectDropboxUsage(estimatedSends);
  const projectedQueueAfter = Math.max(0, ctx.queue.queueRemaining - estimatedSends);

  const pauseReasons: string[] = [];
  if (workflowErrorsIncreasing(ctx)) pauseReasons.push("workflow_errors_increasing");
  if (isDropboxThrottlingDetected(ctx)) pauseReasons.push("dropbox_throttling");
  if (recentCycleFailureStreak(ctx.runner) >= 2) pauseReasons.push("repeated_cycle_failures");
  if (auditInconsistencyDetected(ctx)) pauseReasons.push("audit_inconsistency");

  if (pauseReasons.length > 0) {
    const primary = pauseReasons[0]!;
    return {
      recommendation: "PAUSE_INVESTIGATION_REQUIRED",
      confidence: Math.min(95, 70 + pauseReasons.length * 8),
      reason: `Investigation required: ${pauseReasons.map((r) => limitingFactorLabel(r)).join("; ")}.`,
      limitingFactor: limitingFactorLabel(primary),
      nextRecommendedRunAt: null,
      estimatedCandidatesNextCycle: estimatedSends,
      projectedDropboxApiUsage: projected,
      projectedQueueAfterCycle: projectedQueueAfter,
    };
  }

  if (estimatedSends === 0 && ctx.queue.eligibleNow === 0) {
    return {
      recommendation: "NO_ELIGIBLE_CANDIDATES",
      confidence: ctx.queue.readyAfterRecruiterAssignment > 0 ? 72 : 88,
      reason:
        ctx.queue.readyAfterRecruiterAssignment > 0
          ? "No candidates eligible for immediate send; pipeline waiting on recruiter assignments."
          : "No candidates currently eligible for production paperwork.",
      limitingFactor: limitingFactorLabel("no_eligible_candidates"),
      nextRecommendedRunAt: null,
      estimatedCandidatesNextCycle: 0,
      projectedDropboxApiUsage: projectDropboxUsage(0),
      projectedQueueAfterCycle: ctx.queue.queueRemaining,
    };
  }

  const block = readyNowBlocked(ctx, projected);
  if (!block) {
    const waitMin = computeWaitMinutes(ctx, projected);
    const canRunNow =
      waitMin <= 2 &&
      (ctx.timeSinceLastCycleMs == null || ctx.timeSinceLastCycleMs >= TWO_MIN_MS) &&
      !isDropboxThrottlingDetected(ctx);

    if (canRunNow) {
      let confidence = 82;
      if (ctx.readinessScore != null && ctx.readinessScore >= 85) confidence += 8;
      if (projected.totalRequests <= P167_DROPBOX_CYCLE_BUDGET / 2) confidence += 5;
      if (ctx.recentSendFailures === 0) confidence += 3;
      confidence = Math.min(98, confidence);

      return {
        recommendation: "READY_NOW",
        confidence,
        reason: `Pipeline has ${estimatedSends} projected sends; Dropbox budget (${projected.totalRequests}/${P167_DROPBOX_CYCLE_BUDGET}) and runner gates pass.`,
        limitingFactor: null,
        nextRecommendedRunAt: new Date(ctx.nowMs).toISOString(),
        estimatedCandidatesNextCycle: estimatedSends,
        projectedDropboxApiUsage: projected,
        projectedQueueAfterCycle: projectedQueueAfter,
      };
    }
  }

  let waitMinutes = block ? computeWaitMinutes(ctx, projected) : computeWaitMinutes(ctx, projected);
  if (block === "dropbox_api_budget") waitMinutes = Math.max(waitMinutes, 10);
  if (block === "processing_lock" || block === "daemon_active") waitMinutes = Math.max(waitMinutes, 5);

  const recommendation = waitRecommendationForMinutes(waitMinutes);
  const limitingKey =
    block ??
    (ctx.timeSinceLastCycleMs != null && ctx.timeSinceLastCycleMs < TWO_MIN_MS
      ? "spacing_since_last_cycle"
      : isDropboxThrottlingDetected(ctx)
        ? "dropbox_throttling"
        : ctx.dropbox.rateLimitRemaining != null &&
            ctx.dropbox.rateLimitRemaining <= P167_LOW_RATE_LIMIT_REMAINING_THRESHOLD
          ? "rate_limit_headroom"
          : ctx.monitorDeferredCount > ctx.monitorBudget * 2
            ? "deferred_reconciliation_backlog"
            : ctx.readinessScore != null && ctx.readinessScore < 70
              ? "production_readiness"
              : "spacing_since_last_cycle");

  const blockDetail = block ? ` Blocked from immediate run: ${limitingFactorLabel(block)}.` : "";
  const reason = `Wait ${waitMinutes} minutes before next capped cycle.${blockDetail} Projected ${estimatedSends} sends; queue ${ctx.queue.queueRemaining} → ${projectedQueueAfter}.`;

  let confidence = 75;
  if (estimatedSends > 0) confidence += 5;
  if (!block) confidence += 7;
  if (ctx.readinessScore != null && ctx.readinessScore >= 80) confidence += 5;
  confidence = Math.min(94, confidence);

  return {
    recommendation,
    confidence,
    reason,
    limitingFactor: limitingFactorLabel(limitingKey),
    nextRecommendedRunAt: addMinutes(new Date(ctx.nowMs).toISOString(), waitMinutes),
    estimatedCandidatesNextCycle: estimatedSends,
    projectedDropboxApiUsage: projected,
    projectedQueueAfterCycle: projectedQueueAfter,
  };
}

function buildContextSection(ctx: P167SchedulerContext): P167ProductionSchedulerReport["context"] {
  return {
    eligibleNow: ctx.queue.eligibleNow,
    queueRemaining: ctx.queue.queueRemaining,
    waitingOnSignature: ctx.queue.waitingOnSignature,
    readyAfterRecruiterAssignment: ctx.queue.readyAfterRecruiterAssignment,
    activeSignatureCount: ctx.activeSignatureCount,
    deferredReconciliationCount: ctx.monitorDeferredCount,
    recruitersAvailable: recruitersAvailable(),
    timeSinceLastCycleMs: ctx.timeSinceLastCycleMs,
    lastCycleAt: ctx.lastCycleAt,
    lastSuccessfulCycleAt: ctx.lastSuccessfulCycleAt,
    dropboxRequestsPerMinute: ctx.dropbox.requestsPerMinute,
    dropboxRateLimitRemaining: ctx.dropbox.rateLimitRemaining,
    dropboxResponses429: ctx.dropbox.responses429,
    dropboxThrottlingDetected: isDropboxThrottlingDetected(ctx),
    recentSendFailures: ctx.recentSendFailures,
    recentWorkflowFailures: ctx.todayFailures,
    productionReadinessScore: ctx.readinessScore,
    processingLockHeld: ctx.processingLockHeld,
    daemonActive: ctx.daemonActive,
    continuousModeEnabled: ctx.continuousModeEnabled,
    runnerHealthy: ctx.health.healthy,
    duplicateProtectionActive: ctx.duplicateProtectionActive,
    monitorBudget: ctx.monitorBudget,
    sendCapPerCycle: ctx.sendCap,
    todayPaperworkSent: ctx.todayPaperworkSent,
    todayFailures: ctx.todayFailures,
  };
}

export async function buildP167ProductionSchedulerReport(): Promise<P167ProductionSchedulerReport> {
  const ctx = await gatherP167SchedulerContext();
  const [timeline, decision] = await Promise.all([
    buildP167CycleTimeline(10),
    Promise.resolve(buildDecision(ctx)),
  ]);
  const simulations = buildP167Simulations(ctx);
  const warnings: string[] = [];
  if (ctx.continuousModeEnabled) {
    warnings.push("Continuous mode is enabled — scheduler will not recommend READY_NOW.");
  }
  if (ctx.daemonActive) {
    warnings.push("Production daemon is active — manual batch recommendation only.");
  }

  return {
    sourcePhase: P167_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    decision,
    context: buildContextSection(ctx),
    timeline,
    simulations,
    warnings,
  };
}
