import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  waitRecommendationForMinutes,
  P167_DROPBOX_CYCLE_BUDGET,
} from "@/lib/p167-intelligent-production-scheduler/constants";
import {
  projectDropboxUsage,
  type P167SchedulerContext,
} from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import { buildP167Simulations } from "@/lib/p167-intelligent-production-scheduler/simulate-scheduler";

function baseContext(overrides: Partial<P167SchedulerContext> = {}): P167SchedulerContext {
  return {
    nowMs: Date.parse("2026-07-08T17:00:00.000Z"),
    queue: {
      candidatesEvaluated: 100,
      eligibleNow: 5,
      readyAfterRecruiterAssignment: 2,
      readyAfterWorkflowTransition: 0,
      waitingOnSignature: 10,
      alreadySent: 8,
      alreadySigned: 2,
      duplicates: 0,
      invalidEmails: 0,
      manualReview: 0,
      blocked: 0,
      queueRemaining: 20,
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
      averageCycleDurationMs: 120_000,
      runCount: 2,
      processingLock: null,
      lastError: null,
      candidatesEvaluated: 100,
      assigned: 0,
      sent: 20,
      skipped: 0,
      duplicatesPrevented: 0,
      errors: 0,
      queueRemaining: 20,
      dailyMetrics: {
        date: "2026-07-08",
        sent: 20,
        signaturesCompleted: 0,
        assigned: 0,
        duplicatesPrevented: 0,
        errors: 7,
      },
      recentCycles: [
        {
          cycleNumber: 2,
          startedAt: "2026-07-08T16:30:00.000Z",
          completedAt: "2026-07-08T16:41:00.000Z",
          durationMs: 660_000,
          candidatesEvaluated: 50,
          assigned: 0,
          sent: 10,
          skipped: 0,
          duplicatesPrevented: 0,
          errors: 0,
          queueRemaining: 20,
          dryRun: false,
        },
      ],
      updatedAt: "2026-07-08T16:41:00.000Z",
    },
    health: {
      generatedAt: "2026-07-08T17:00:00.000Z",
      overallStatus: "healthy",
      healthy: true,
      checks: [],
      abortReason: null,
    },
    dropbox: {
      postRequests: 10,
      getRequests: 0,
      totalRequests: 10,
      requestsPerMinute: 0,
      rateLimitRemaining: 50,
      rateLimitResetAt: null,
      retries: 0,
      responses429: 0,
      averageLatencyMs: 200,
      cacheHits: 10,
      cacheMisses: 0,
      executionScopeDedupes: 0,
      rateLimitedPausedMs: 0,
      observedAt: "2026-07-08T17:00:00.000Z",
    },
    monitorDeferredCount: 5,
    activeSignatureCount: 91,
    sendCap: 10,
    monitorBudget: 25,
    readinessScore: 88,
    recentSendFailures: 0,
    todayFailures: 7,
    todayPaperworkSent: 20,
    duplicateProtectionActive: true,
    daemonActive: false,
    continuousModeEnabled: false,
    processingLockHeld: false,
    lastCycleAt: "2026-07-08T16:41:00.000Z",
    lastSuccessfulCycleAt: "2026-07-08T16:41:00.000Z",
    timeSinceLastCycleMs: 19 * 60_000,
    ...overrides,
  };
}

describe("P167 intelligent production scheduler", () => {
  it("maps wait minutes to valid recommendations", () => {
    assert.equal(waitRecommendationForMinutes(1), "WAIT_2_MINUTES");
    assert.equal(waitRecommendationForMinutes(4), "WAIT_5_MINUTES");
    assert.equal(waitRecommendationForMinutes(8), "WAIT_10_MINUTES");
    assert.equal(waitRecommendationForMinutes(20), "WAIT_15_MINUTES");
  });

  it("projects Dropbox usage with worst-case GET per send", () => {
    const usage = projectDropboxUsage(10);
    assert.equal(usage.totalRequests, 20);
    assert.equal(usage.withinBudget, true);
    assert.equal(usage.budgetCeiling, P167_DROPBOX_CYCLE_BUDGET);
  });

  it("flags over-budget projections", () => {
    const usage = projectDropboxUsage(20);
    assert.equal(usage.withinBudget, false);
  });

  it("returns five read-only simulation scenarios", () => {
    const sims = buildP167Simulations(baseContext());
    assert.equal(sims.length, 5);
    assert.ok(sims.every((s) => s.notes.some((n) => n.includes("Read-only"))));
    const runNow = sims.find((s) => s.scenario === "run_now");
    assert.ok(runNow);
    assert.equal(runNow!.expectedSends, 7);
  });

  it("blocks run-now simulation when continuous mode enabled", () => {
    const sims = buildP167Simulations(baseContext({ continuousModeEnabled: true }));
    const runNow = sims.find((s) => s.scenario === "run_now")!;
    assert.notEqual(runNow.recommendation, "READY_NOW");
  });
});
