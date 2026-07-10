import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it, before, after } from "node:test";

import { composeP161AppHealthReport } from "@/lib/app-loading-reliability/build-app-health";
import { P161_CLIENT_SECTION_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import type { P1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";
import {
  getMetricsSnapshot,
  recordCacheHit,
  recordCacheMiss,
  recordFunctionTiming,
  recordSnapshotBuild,
  resetMetrics,
} from "@/lib/app-performance/performance-metrics";
import {
  getCachedSnapshot,
  resetSnapshotCache,
  setCachedSnapshot,
  SNAPSHOT_FRESH_TTL_MS,
  SNAPSHOT_STALE_TTL_MS,
} from "@/lib/app-performance/snapshot-cache";
import { serveExecutiveSnapshot } from "@/lib/app-performance/serve-snapshot";
import { EXECUTIVE_SNAPSHOT_VERSION, type ExecutiveSnapshot } from "@/lib/app-performance/snapshot-store";

function minimalRunnerState(): P1547RunnerState {
  return {
    version: "test",
    currentStatus: "stopped",
    schedulerMode: "stopped",
    continuousEnabled: false,
    scheduleIntervalMs: 60_000,
    serverStartTime: null,
    lastRun: null,
    nextRun: null,
    lastSuccessfulRun: null,
    cycleDurationMs: null,
    averageCycleDurationMs: null,
    runCount: 0,
    processingLock: null,
    lastError: null,
    candidatesEvaluated: 0,
    assigned: 0,
    sent: 0,
    skipped: 0,
    duplicatesPrevented: 0,
    errors: 0,
    queueRemaining: 0,
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
  };
}

function minimalSnapshot(overrides: Partial<ExecutiveSnapshot> = {}): ExecutiveSnapshot {
  const generatedAt = overrides.generatedAt ?? new Date().toISOString();
  return {
    version: EXECUTIVE_SNAPSHOT_VERSION,
    origin: "full",
    generatedAt,
    buildDurationMs: 42,
    appHealth: {
      sourcePhase: "P161",
      generatedAt,
      operatingMode: {
        label: "Observation mode",
        continuousEnabled: false,
        daemonRunning: false,
        systemMode: "manual_only",
        observationMode: true,
      },
      systemStatus: {
        paperworkSentToday: 0,
        sendBatchesToday: 0,
        failuresToday: 0,
        eligibleNow: 0,
        queueRemaining: 0,
        lastProductionCycle: null,
        readinessScore: 81,
        daemonRunning: false,
      },
      pageHealth: [],
      apiHealth: [],
      slowEndpoints: [],
      degradedSections: [],
      lastSuccessfulDataTimestamps: {},
      warnings: [],
      dropboxApiMetrics: {
        postRequests: 0,
        getRequests: 0,
        totalRequests: 0,
        requestsPerMinute: 0,
        rateLimitRemaining: null,
        rateLimitResetAt: null,
        retries: 0,
        responses429: 0,
        averageLatencyMs: null,
        cacheHits: 0,
        cacheMisses: 0,
        executionScopeDedupes: 0,
        rateLimitedPausedMs: 0,
        observedAt: generatedAt,
      },
    },
    productionReadiness: {
      sourcePhase: "P160",
      generatedAt,
      overallReadinessScore: 81,
      recommendation: "ready_for_observation_mode",
      recommendationDetail: "test",
      infrastructure: {
        buildStatus: "ready",
        buildDetail: "ok",
        nodeVersion: "v20",
        nodeCompatible: true,
        serverCompatibility: "ok",
        runtimeHealth: "ready",
        environmentVariables: [],
        secretsConfigured: [],
      },
      integrations: { overall: "ready", items: [] },
      automation: { overall: "ready", phases: [] },
      safety: { overall: "ready", items: [] },
      deployment: { overall: "ready", items: [] },
      risks: { critical: [], high: [], medium: [], low: [] },
      validation: {
        readOnly: true,
        continuousModeEnabled: false,
        daemonRunning: false,
        noLiveActionsPerformed: true,
      },
    },
    operations: {
      sourcePhase: "P159",
      generatedAt,
      runner: {
        systemMode: "manual_only",
        continuousEnabled: false,
        schedulerMode: "stopped",
        daemonRunning: false,
        autopilotEnabled: false,
        lastCycleAt: null,
        nextCycleAt: null,
        intervalMinutes: 60,
        uptimeMs: null,
        serverStartTime: null,
        processingLockHeld: false,
        lockRunId: null,
        lockAgeMs: null,
        staleLockWarning: false,
        lastError: null,
        maxSendsPerCycle: 5,
        maxAssignmentsPerCycle: 10,
      },
      today: {
        paperworkSent: 0,
        sendBatchCount: 0,
        sendBatches: [],
        signedToday: 0,
        viewedToday: 0,
        pendingSignatures: 0,
        duplicatesPrevented: 0,
        failures: 0,
      },
      queue: {
        candidatesEvaluated: 100,
        eligibleNow: 0,
        readyAfterRecruiterAssignment: 0,
        readyAfterWorkflowTransition: 0,
        waitingOnSignature: 0,
        alreadySent: 0,
        alreadySigned: 0,
        duplicates: 0,
        invalidEmails: 0,
        manualReview: 0,
        blocked: 0,
        queueRemaining: 0,
      },
      batchHistory: [],
      safety: {
        duplicateProtectionActive: true,
        activeSignatureProtectionActive: true,
        invalidEmailProtectionActive: true,
        alreadySentProtectionActive: true,
        breezyWriteProtectionActive: true,
        capsActive: true,
        stopOnErrorActive: true,
      },
      continuousMode: {
        available: true,
        enabled: false,
        controlAllowed: false,
        note: "Continuous mode disabled",
      },
      liveCycleGates: {
        executiveSessionRequired: true,
        confirmLiveRequired: true,
        envFlagRequired: "P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED",
        envFlagEnabled: false,
        maxSendsPerCycle: 5,
      },
      recommendation: "continue_manual_batches",
      recommendationDetail: "test",
    },
    queueSummary: {
      candidatesEvaluated: 100,
      eligibleNow: 0,
      queueRemaining: 0,
      waitingOnSignature: 0,
      manualReview: 0,
      blocked: 0,
    },
    operationsSummary: {
      systemMode: "manual_only",
      recommendation: "continue_manual_batches",
      recommendationDetail: "test",
      daemonRunning: false,
      continuousEnabled: false,
    },
    todaysPaperwork: {
      paperworkSent: 0,
      signedToday: 0,
      pendingSignatures: 0,
      duplicatesPrevented: 0,
      failures: 0,
    },
    todaysBatches: {
      sendBatchCount: 0,
      sendBatches: [],
      recentBatchHistory: [],
    },
    readinessScore: 81,
    failures: 0,
    lastCycle: null,
    daemonStatus: {
      daemonRunning: false,
      continuousEnabled: false,
      schedulerMode: "stopped",
      systemMode: "manual_only",
      serverStartTime: null,
    },
    warnings: [],
    ...overrides,
  };
}

describe("P161.1 executive performance optimization", () => {
  let tempDataDir: string;
  let prevDataDir: string | undefined;

  before(() => {
    tempDataDir = mkdtempSync(path.join(tmpdir(), "p1611-snapshot-"));
    prevDataDir = process.env.SRS_RECRUITING_DATA_DIR;
    process.env.SRS_RECRUITING_DATA_DIR = tempDataDir;
    resetMetrics();
    resetSnapshotCache();
  });

  after(() => {
    if (prevDataDir === undefined) delete process.env.SRS_RECRUITING_DATA_DIR;
    else process.env.SRS_RECRUITING_DATA_DIR = prevDataDir;
    resetMetrics();
    resetSnapshotCache();
  });

  it("tracks cache hit rate and longest function", () => {
    resetMetrics();
    recordCacheHit();
    recordCacheHit();
    recordCacheMiss();
    recordFunctionTiming("buildP160ProductionReadiness", 17_000);
    recordFunctionTiming("readIngestionStore", 5);
    recordSnapshotBuild(17_500);

    const m = getMetricsSnapshot();
    assert.equal(m.cacheHits, 2);
    assert.equal(m.cacheMisses, 1);
    assert.equal(m.cacheHitRatePct, 66.7);
    assert.equal(m.longestFunction?.label, "buildP160ProductionReadiness");
    assert.equal(m.lastSnapshotBuildMs, 17_500);
  });

  it("classifies snapshot freshness (fresh / aging / stale)", async () => {
    resetSnapshotCache();

    const fresh = minimalSnapshot({ generatedAt: new Date().toISOString() });
    await setCachedSnapshot(fresh);
    const freshResult = await getCachedSnapshot();
    assert.equal(freshResult.freshness, "fresh");
    assert.ok((freshResult.ageMs ?? 0) <= SNAPSHOT_FRESH_TTL_MS);

    resetSnapshotCache();
    const aging = minimalSnapshot({
      generatedAt: new Date(Date.now() - SNAPSHOT_FRESH_TTL_MS - 5_000).toISOString(),
    });
    await setCachedSnapshot(aging);
    const agingResult = await getCachedSnapshot();
    assert.equal(agingResult.freshness, "aging");

    resetSnapshotCache();
    const stale = minimalSnapshot({
      generatedAt: new Date(Date.now() - SNAPSHOT_STALE_TTL_MS - 1_000).toISOString(),
    });
    await setCachedSnapshot(stale);
    const staleResult = await getCachedSnapshot();
    assert.equal(staleResult.freshness, "stale");
  });

  it("serves a fresh cached snapshot without blocking", async () => {
    resetSnapshotCache();
    const snap = minimalSnapshot();
    await setCachedSnapshot(snap);

    const served = await serveExecutiveSnapshot();
    assert.equal(served.snapshot.origin, "full");
    assert.equal(served.meta.cached, true);
    assert.equal(served.meta.stale, false);
    assert.equal(served.meta.refreshing, false);
    assert.equal(served.snapshot.readinessScore, 81);
    assert.equal(served.snapshot.productionReadiness.validation.readOnly, true);
    assert.equal(served.snapshot.productionReadiness.validation.noLiveActionsPerformed, true);
  });

  it("composeP161AppHealthReport derives system status from pre-built P159/P160", () => {
    const generatedAt = new Date().toISOString();
    const p159 = {
      dashboard: minimalSnapshot().operations,
      warnings: [] as string[],
    };
    const p160 = minimalSnapshot().productionReadiness;

    const report = composeP161AppHealthReport({
      p159Result: { value: p159, error: null, timedOut: false, elapsedMs: 12 },
      p160Result: { value: p160, error: null, timedOut: false, elapsedMs: 8 },
      runnerState: minimalRunnerState(),
      continuousEnabled: false,
    });

    assert.equal(report.systemStatus.readinessScore, 81);
    assert.equal(report.systemStatus.daemonRunning, false);
    assert.equal(report.operatingMode.continuousEnabled, false);
    assert.equal(report.operatingMode.observationMode, true);
    assert.ok(report.generatedAt >= generatedAt.slice(0, 10));
  });

  it("safety: continuous mode remains disabled in test environment", () => {
    assert.equal(isP154ContinuousEnabled(), false);
  });

  it("client timeout restored to 5s (no timeout-hiding)", () => {
    assert.equal(P161_CLIENT_SECTION_TIMEOUT_MS, 5_000);
  });
});
