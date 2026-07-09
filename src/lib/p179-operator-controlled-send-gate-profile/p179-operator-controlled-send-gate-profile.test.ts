import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { P168ApprovalAction } from "@/lib/p168-executive-approval/approval-types";
import type { P167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type { P167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler/types";
import { P167_SOURCE_PHASE } from "@/lib/p167-intelligent-production-scheduler/types";
import { classifySendCycleGateFactors } from "@/lib/p179-operator-controlled-send-gate-profile/classify-gate-factors";
import { collectSendCycleGateFactors } from "@/lib/p179-operator-controlled-send-gate-profile/collect-send-cycle-gate-factors";
import { evaluateSendCycleGatesFromContext } from "@/lib/p179-operator-controlled-send-gate-profile/evaluate-send-cycle-gates";
import { resolveGateProfileForP159LiveCycle } from "@/lib/p179-operator-controlled-send-gate-profile/resolve-gate-profile";

function schedulerReport(
  overrides: Partial<P167ProductionSchedulerReport["decision"]> = {},
): P167ProductionSchedulerReport {
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
      sent: 0,
      skipped: 0,
      duplicatesPrevented: 0,
      errors: 0,
      recentCycles: [],
    },
    health: {
      generatedAt: new Date().toISOString(),
      overallStatus: "healthy",
      healthy: true,
      checks: [
        {
          id: "dropbox_sign_api",
          label: "Dropbox Sign API",
          status: "healthy",
          detail: "ok",
        },
      ],
      abortReason: null,
    },
    dropbox: {
      requestsLastMinute: 0,
      rateLimitRemaining: 50,
      responses429: 0,
      lastRequestAt: null,
    },
    monitorDeferredCount: 0,
    activeSignatureCount: 0,
    sendCap: 10,
    monitorBudget: 25,
    readinessScore: 88,
    recentSendFailures: 0,
    todayFailures: 0,
    todayPaperworkSent: 0,
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

function evaluate(input: {
  profile: "operator" | "autonomous";
  ctx?: Partial<P167SchedulerContext>;
  scheduler?: Partial<P167ProductionSchedulerReport["decision"]>;
  approvalAction?: P168ApprovalAction;
}) {
  return evaluateSendCycleGatesFromContext({
    profile: input.profile,
    ctx: baseCtx(input.ctx),
    scheduler: schedulerReport(input.scheduler),
    approvalAction: input.approvalAction ?? "RUN_NEXT_BATCH",
    readinessThreshold: 80,
  });
}

describe("P179 operator controlled send gate profile", () => {
  it("resolves operator profile for executive live_cycle without continuous/daemon", () => {
    assert.equal(
      resolveGateProfileForP159LiveCycle({
        confirmLive: true,
        sessionRole: "executive",
        continuousModeEnabled: false,
        daemonActive: false,
      }),
      "operator",
    );
    assert.equal(
      resolveGateProfileForP159LiveCycle({
        confirmLive: true,
        sessionRole: "executive",
        continuousModeEnabled: true,
        daemonActive: false,
      }),
      "autonomous",
    );
  });

  it("readiness 70 blocks autonomous but not operator when other checks pass", () => {
    const ctx = baseCtx({ readinessScore: 70 });
    const auto = evaluate({ profile: "autonomous", ctx });
    const op = evaluate({ profile: "operator", ctx });
    assert.equal(auto.pass, false);
    assert.ok(auto.blockingFactors.some((f) => f.includes("readiness")));
    assert.equal(op.pass, true);
    assert.ok(op.warnings.some((f) => f.includes("readiness")));
  });

  it("scheduler WAIT blocks autonomous but not operator", () => {
    const scheduler = { recommendation: "WAIT_10_MINUTES" as const };
    const auto = evaluate({ profile: "autonomous", scheduler });
    const op = evaluate({ profile: "operator", scheduler });
    assert.equal(auto.pass, false);
    assert.ok(auto.blockingFactors.some((f) => f.includes("Scheduler")));
    assert.equal(op.pass, true);
    assert.ok(op.warnings.some((f) => f.includes("Scheduler")));
  });

  it("executive WAIT blocks autonomous but not operator", () => {
    const auto = evaluate({ profile: "autonomous", approvalAction: "WAIT" });
    const op = evaluate({ profile: "operator", approvalAction: "WAIT" });
    assert.equal(auto.pass, false);
    assert.ok(auto.blockingFactors.some((f) => f.includes("Executive")));
    assert.equal(op.pass, true);
    assert.ok(op.warnings.some((f) => f.includes("Executive")));
  });

  it("duplicate protection disabled blocks both profiles", () => {
    const ctx = baseCtx({ duplicateProtectionActive: false });
    const auto = evaluate({ profile: "autonomous", ctx });
    const op = evaluate({ profile: "operator", ctx });
    assert.equal(auto.pass, false);
    assert.equal(op.pass, false);
    assert.ok(auto.blockingFactors.some((f) => f.includes("Duplicate protection")));
    assert.ok(op.blockingFactors.some((f) => f.includes("Duplicate protection")));
  });

  it("processing lock blocks both profiles", () => {
    const ctx = baseCtx({ processingLockHeld: true });
    const auto = evaluate({ profile: "autonomous", ctx });
    const op = evaluate({ profile: "operator", ctx });
    assert.equal(auto.pass, false);
    assert.equal(op.pass, false);
  });

  it("dropbox budget exceeded blocks both profiles", () => {
    const ctx = baseCtx({
      sendCap: 25,
      queue: {
        ...baseCtx().queue,
        eligibleNow: 25,
      },
    });
    const auto = evaluate({ profile: "autonomous", ctx });
    const op = evaluate({ profile: "operator", ctx });
    assert.equal(auto.pass, false);
    assert.equal(op.pass, false);
    assert.ok(auto.blockingFactors.some((f) => f.includes("Dropbox API budget")));
  });

  it("classifies operator soft factors into warnings only", () => {
    const factors = collectSendCycleGateFactors({
      ctx: baseCtx({ readinessScore: 70 }),
      scheduler: schedulerReport({ recommendation: "WAIT_10_MINUTES" }),
      approvalAction: "WAIT",
      readinessThreshold: 80,
    });
    const classified = classifySendCycleGateFactors(factors, "operator");
    assert.equal(classified.pass, true);
    assert.ok(classified.warnings.length >= 3);
    assert.equal(classified.blockingFactors.length, 0);
  });
});
