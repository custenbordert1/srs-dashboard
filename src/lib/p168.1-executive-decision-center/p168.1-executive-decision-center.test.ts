import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeExecutiveDecisionScore } from "@/lib/p168.1-executive-decision-center/compute-decision-score";
import { buildGateChecklist } from "@/lib/p168.1-executive-decision-center/build-gate-checklist";
import type { P167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";

function healthyCtx(): P167SchedulerContext {
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
      lastRun: null,
      nextRun: null,
      lastSuccessfulRun: null,
      cycleDurationMs: null,
      averageCycleDurationMs: 600_000,
      runCount: 0,
      processingLock: null,
      lastError: null,
      candidatesEvaluated: 0,
      assigned: 0,
      sent: 0,
      skipped: 0,
      duplicatesPrevented: 0,
      errors: 0,
      queueRemaining: 50,
      dailyMetrics: {
        date: "2026-07-08",
        sent: 0,
        signaturesCompleted: 0,
        assigned: 0,
        duplicatesPrevented: 0,
        errors: 0,
      },
      recentCycles: [],
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
      rateLimitRemaining: 80,
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
    activeSignatureCount: 30,
    sendCap: 10,
    monitorBudget: 25,
    readinessScore: 90,
    recentSendFailures: 0,
    todayFailures: 0,
    todayPaperworkSent: 0,
    duplicateProtectionActive: true,
    daemonActive: false,
    continuousModeEnabled: false,
    processingLockHeld: false,
    lastCycleAt: null,
    lastSuccessfulCycleAt: null,
    timeSinceLastCycleMs: null,
  };
}

describe("P168.1 executive decision center", () => {
  it("computes decision score with grade mapping", () => {
    const score = computeExecutiveDecisionScore({
      readinessScore: 92,
      runnerHealthy: true,
      runnerIdle: true,
      dropboxThrottling: false,
      dropboxWithinBudget: true,
      eligibleNow: 10,
      queueRemaining: 50,
      deferredCount: 5,
      monitorBudget: 25,
      processingLockHeld: false,
      duplicateProtectionActive: true,
      activeSignatureCount: 30,
      recentSendFailures: 0,
      todayFailures: 0,
    });
    assert.ok(score.decisionScore >= 85);
    assert.ok(["Excellent", "Healthy", "Caution", "Intervention Required"].includes(score.decisionGrade));
  });

  it("lowers score when readiness is poor", () => {
    const healthy = computeExecutiveDecisionScore({
      readinessScore: 90,
      runnerHealthy: true,
      runnerIdle: true,
      dropboxThrottling: false,
      dropboxWithinBudget: true,
      eligibleNow: 10,
      queueRemaining: 50,
      deferredCount: 5,
      monitorBudget: 25,
      processingLockHeld: false,
      duplicateProtectionActive: true,
      activeSignatureCount: 30,
      recentSendFailures: 0,
      todayFailures: 0,
    });
    const poor = computeExecutiveDecisionScore({
      ...{
        readinessScore: 55,
        runnerHealthy: true,
        runnerIdle: true,
        dropboxThrottling: false,
        dropboxWithinBudget: true,
        eligibleNow: 0,
        queueRemaining: 50,
        deferredCount: 60,
        monitorBudget: 25,
        processingLockHeld: true,
        duplicateProtectionActive: true,
        activeSignatureCount: 120,
        recentSendFailures: 2,
        todayFailures: 5,
      },
    });
    assert.ok(poor.decisionScore < healthy.decisionScore);
  });

  it("renders pass and fail gate checklist items", () => {
    const checklist = buildGateChecklist(healthyCtx(), { pass: false, blockingFactors: ["test"] });
    assert.ok(checklist.length >= 10);
    assert.ok(checklist.some((c) => c.pass));
    assert.ok(checklist.some((c) => !c.pass));
  });
});
