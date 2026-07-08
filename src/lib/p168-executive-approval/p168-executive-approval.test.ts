import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildApprovalRecommendation,
  evaluateRunNextBatchGates,
} from "@/lib/p168-executive-approval/build-approval-recommendation";
import { assertP168UsesExistingProductionPath } from "@/lib/p168-executive-approval/approval-validation";
import type { P167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type { P167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler/types";
import { P167_SOURCE_PHASE } from "@/lib/p167-intelligent-production-scheduler/types";

function schedulerReport(overrides: Partial<P167ProductionSchedulerReport["decision"]> = {}): P167ProductionSchedulerReport {
  return {
    sourcePhase: P167_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    decision: {
      recommendation: "READY_NOW",
      confidence: 90,
      reason: "Ready",
      limitingFactor: null,
      nextRecommendedRunAt: new Date().toISOString(),
      estimatedCandidatesNextCycle: 10,
      projectedDropboxApiUsage: {
        postRequests: 10,
        getRequests: 10,
        totalRequests: 20,
        withinBudget: true,
        budgetCeiling: 35,
      },
      projectedQueueAfterCycle: 40,
      ...overrides,
    },
    context: {
      eligibleNow: 10,
      queueRemaining: 50,
      waitingOnSignature: 5,
      readyAfterRecruiterAssignment: 0,
      activeSignatureCount: 20,
      deferredReconciliationCount: 5,
      recruitersAvailable: 4,
      timeSinceLastCycleMs: 5 * 60_000,
      lastCycleAt: "2026-07-08T16:41:00.000Z",
      lastSuccessfulCycleAt: "2026-07-08T16:41:00.000Z",
      dropboxRequestsPerMinute: 0,
      dropboxRateLimitRemaining: 50,
      dropboxResponses429: 0,
      dropboxThrottlingDetected: false,
      recentSendFailures: 0,
      recentWorkflowFailures: 0,
      productionReadinessScore: 88,
      processingLockHeld: false,
      daemonActive: false,
      continuousModeEnabled: false,
      runnerHealthy: true,
      duplicateProtectionActive: true,
      monitorBudget: 25,
      sendCapPerCycle: 10,
      todayPaperworkSent: 20,
      todayFailures: 0,
    },
    timeline: [],
    simulations: [],
    warnings: [],
  };
}

function baseCtx(overrides: Partial<P167SchedulerContext> = {}): P167SchedulerContext {
  return {
    nowMs: Date.now(),
    queue: {
      candidatesEvaluated: 100,
      eligibleNow: 10,
      readyAfterRecruiterAssignment: 0,
      readyAfterWorkflowTransition: 0,
      waitingOnSignature: 5,
      alreadySent: 0,
      alreadySigned: 0,
      duplicates: 0,
      invalidEmails: 0,
      manualReview: 0,
      blocked: 0,
      queueRemaining: 50,
    },
    runner: {
      version: "P154.7",
      currentStatus: "idle",
      schedulerMode: "manual",
      continuousEnabled: false,
      scheduleIntervalMs: 600_000,
      serverStartTime: null,
      lastRun: "2026-07-08T16:41:00.000Z",
      nextRun: null,
      lastSuccessfulRun: "2026-07-08T16:41:00.000Z",
      cycleDurationMs: 120_000,
      averageCycleDurationMs: 600_000,
      runCount: 1,
      processingLock: null,
      lastError: null,
      candidatesEvaluated: 100,
      assigned: 0,
      sent: 10,
      skipped: 0,
      duplicatesPrevented: 0,
      errors: 0,
      queueRemaining: 50,
      dailyMetrics: {
        date: "2026-07-08",
        sent: 10,
        signaturesCompleted: 0,
        assigned: 0,
        duplicatesPrevented: 0,
        errors: 0,
      },
      recentCycles: [
        {
          cycleNumber: 1,
          startedAt: "2026-07-08T16:30:00.000Z",
          completedAt: "2026-07-08T16:41:00.000Z",
          durationMs: 660_000,
          candidatesEvaluated: 50,
          assigned: 0,
          sent: 10,
          skipped: 0,
          duplicatesPrevented: 0,
          errors: 0,
          queueRemaining: 50,
          dryRun: false,
        },
      ],
      updatedAt: new Date().toISOString(),
    },
    health: {
      generatedAt: new Date().toISOString(),
      overallStatus: "healthy",
      healthy: true,
      checks: [],
      abortReason: null,
    },
    dropbox: {
      postRequests: 0,
      getRequests: 0,
      totalRequests: 0,
      requestsPerMinute: 0,
      rateLimitRemaining: 50,
      rateLimitResetAt: null,
      retries: 0,
      responses429: 0,
      averageLatencyMs: null,
      cacheHits: 0,
      cacheMisses: 0,
      executionScopeDedupes: 0,
      rateLimitedPausedMs: 0,
      observedAt: new Date().toISOString(),
    },
    monitorDeferredCount: 5,
    activeSignatureCount: 20,
    sendCap: 10,
    monitorBudget: 25,
    readinessScore: 88,
    recentSendFailures: 0,
    todayFailures: 0,
    todayPaperworkSent: 10,
    duplicateProtectionActive: true,
    daemonActive: false,
    continuousModeEnabled: false,
    processingLockHeld: false,
    lastCycleAt: "2026-07-08T16:41:00.000Z",
    lastSuccessfulCycleAt: "2026-07-08T16:41:00.000Z",
    timeSinceLastCycleMs: 5 * 60_000,
    ...overrides,
  };
}

describe("P168 executive approval", () => {
  it("returns exactly one recommendation action", () => {
    const rec = buildApprovalRecommendation({
      scheduler: schedulerReport(),
      ctx: baseCtx(),
    });
    assert.ok(["WAIT", "RUN_NEXT_BATCH", "HOLD_INVESTIGATION", "NO_ACTION_REQUIRED"].includes(rec.action));
    assert.ok(rec.id.startsWith("p168-"));
    assert.equal(rec.expectedSends, 10);
  });

  it("maps PAUSE_INVESTIGATION to HOLD_INVESTIGATION", () => {
    const rec = buildApprovalRecommendation({
      scheduler: schedulerReport({ recommendation: "PAUSE_INVESTIGATION_REQUIRED" }),
      ctx: baseCtx(),
    });
    assert.equal(rec.action, "HOLD_INVESTIGATION");
  });

  it("maps no eligible to NO_ACTION_REQUIRED", () => {
    const rec = buildApprovalRecommendation({
      scheduler: schedulerReport({
        recommendation: "NO_ELIGIBLE_CANDIDATES",
        estimatedCandidatesNextCycle: 0,
      }),
      ctx: baseCtx({ queue: { ...baseCtx().queue, eligibleNow: 0 } }),
    });
    assert.equal(rec.action, "NO_ACTION_REQUIRED");
  });

  it("blocks RUN_NEXT_BATCH when runner is running", () => {
    const gates = evaluateRunNextBatchGates(baseCtx({ runner: { ...baseCtx().runner, currentStatus: "running" } }));
    assert.equal(gates.pass, false);
    assert.ok(gates.blockingFactors.some((f) => f.includes("running")));
  });

  it("blocks RUN_NEXT_BATCH when readiness below threshold", () => {
    const gates = evaluateRunNextBatchGates(baseCtx({ readinessScore: 75 }));
    assert.equal(gates.pass, false);
  });

  it("uses existing P159 live_cycle production path", () => {
    const pathCheck = assertP168UsesExistingProductionPath();
    assert.equal(pathCheck.usesP159LiveCycle, true);
    assert.equal(pathCheck.noNewSendImplementation, true);
  });
});
