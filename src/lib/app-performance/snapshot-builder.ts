/**
 * P161.1 — Executive snapshot builder.
 *
 * Runs the expensive executive pipeline ONCE (P159 operations control center +
 * P160 production readiness) and composes every executive summary from those two
 * results. This is the only place the ~18s pipeline runs; it executes in the
 * background so no page request ever waits for it.
 *
 * Read-only: performs no paperwork sends, workflow writes, or Breezy writes, and
 * never starts the daemon or enables continuous mode.
 */
import {
  composeP161AppHealthReport,
  type P161AppHealthReport,
} from "@/lib/app-loading-reliability/build-app-health";
import {
  recordSnapshotBuild,
  timeFunction,
} from "@/lib/app-performance/performance-metrics";
import {
  EXECUTIVE_SNAPSHOT_VERSION,
  type ExecutiveSnapshot,
} from "@/lib/app-performance/snapshot-store";
import { buildP159FastSnapshot } from "@/lib/app-loading-reliability/build-p159-fast-snapshot";
import { buildP160FastSnapshot } from "@/lib/app-loading-reliability/build-p160-fast-snapshot";
import { buildP159OperationsControlCenter } from "@/lib/p159-operations-control-center";
import type { P159DashboardBuildResult } from "@/lib/p159-operations-control-center/build-operations-control-center";
import { buildP160ProductionReadiness } from "@/lib/p160-production-readiness";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { withRequestTimeout } from "@/lib/app-loading-reliability/request-timeout";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";

function composeSnapshot(input: {
  origin: ExecutiveSnapshot["origin"];
  buildDurationMs: number;
  appHealth: P161AppHealthReport;
  p159: P159DashboardBuildResult;
  productionReadiness: ExecutiveSnapshot["productionReadiness"];
  continuousEnabled: boolean;
  daemonRunning: boolean;
  serverStartTime: string | null;
  warnings: string[];
}): ExecutiveSnapshot {
  const dashboard = input.p159.dashboard;
  return {
    version: EXECUTIVE_SNAPSHOT_VERSION,
    origin: input.origin,
    generatedAt: new Date().toISOString(),
    buildDurationMs: input.buildDurationMs,
    appHealth: input.appHealth,
    productionReadiness: input.productionReadiness,
    operations: dashboard,
    queueSummary: {
      candidatesEvaluated: dashboard.queue.candidatesEvaluated,
      eligibleNow: dashboard.queue.eligibleNow,
      queueRemaining: dashboard.queue.queueRemaining,
      waitingOnSignature: dashboard.queue.waitingOnSignature,
      manualReview: dashboard.queue.manualReview,
      blocked: dashboard.queue.blocked,
    },
    operationsSummary: {
      systemMode: dashboard.runner.systemMode,
      recommendation: dashboard.recommendation,
      recommendationDetail: dashboard.recommendationDetail,
      daemonRunning: input.daemonRunning,
      continuousEnabled: input.continuousEnabled,
    },
    todaysPaperwork: {
      paperworkSent: dashboard.today.paperworkSent,
      signedToday: dashboard.today.signedToday,
      pendingSignatures: dashboard.today.pendingSignatures,
      duplicatesPrevented: dashboard.today.duplicatesPrevented,
      failures: dashboard.today.failures,
    },
    todaysBatches: {
      sendBatchCount: dashboard.today.sendBatchCount,
      sendBatches: dashboard.today.sendBatches,
      recentBatchHistory: dashboard.batchHistory.slice(0, 10),
    },
    readinessScore: input.productionReadiness.overallReadinessScore ?? null,
    failures: dashboard.today.failures,
    lastCycle: dashboard.runner.lastCycleAt,
    daemonStatus: {
      daemonRunning: input.daemonRunning,
      continuousEnabled: input.continuousEnabled,
      schedulerMode: dashboard.runner.schedulerMode,
      systemMode: dashboard.runner.systemMode,
      serverStartTime: input.serverStartTime,
    },
    warnings: input.warnings,
  };
}

/**
 * Full snapshot build — runs the complete P159 + P160 pipeline once (~18s).
 * Intended to run in the background via `background-refresh`.
 */
export async function buildExecutiveSnapshot(): Promise<ExecutiveSnapshot> {
  const startedAt = Date.now();
  const continuousEnabled = isP154ContinuousEnabled();

  const [runnerState, p159Result, p160Result] = await Promise.all([
    loadP1547RunnerState(),
    timeFunction("buildP159OperationsControlCenter", () =>
      withRequestTimeout({
        label: "P159 operations control center",
        promise: buildP159OperationsControlCenter(),
        timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
        fallback: null,
      }),
    ),
    timeFunction("buildP160ProductionReadiness", () =>
      withRequestTimeout({
        label: "P160 production readiness",
        promise: buildP160ProductionReadiness(),
        timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
        fallback: null,
      }),
    ),
  ]);

  const appHealth = composeP161AppHealthReport({
    p159Result,
    p160Result,
    runnerState,
    continuousEnabled,
  });

  const warnings: string[] = [...appHealth.warnings];
  const p159 = p159Result.value ?? (await buildP159FastSnapshot());
  if (!p159Result.value) warnings.push("P159 pipeline unavailable — using fast snapshot");
  const productionReadiness = p160Result.value ?? (await buildP160FastSnapshot());
  if (!p160Result.value) warnings.push("P160 pipeline unavailable — using fast snapshot");

  const buildDurationMs = Date.now() - startedAt;
  recordSnapshotBuild(buildDurationMs);

  return composeSnapshot({
    origin: p159Result.value && p160Result.value ? "full" : "degraded",
    buildDurationMs,
    appHealth,
    p159,
    productionReadiness,
    continuousEnabled,
    daemonRunning: appHealth.systemStatus.daemonRunning,
    serverStartTime: runnerState.serverStartTime,
    warnings: [...new Set(warnings)],
  });
}

/**
 * Fast placeholder snapshot (<300ms) built from runner state + audit batches
 * only. Served on cold start while the first full background build runs.
 */
export async function buildBuildingSnapshot(): Promise<ExecutiveSnapshot> {
  const startedAt = Date.now();
  const continuousEnabled = isP154ContinuousEnabled();
  const [runnerState, p159, productionReadiness] = await Promise.all([
    loadP1547RunnerState(),
    buildP159FastSnapshot(),
    buildP160FastSnapshot(),
  ]);

  const appHealth = composeP161AppHealthReport({
    p159Result: {
      value: p159,
      error: null,
      timedOut: false,
      elapsedMs: Date.now() - startedAt,
    },
    p160Result: {
      value: productionReadiness,
      error: null,
      timedOut: false,
      elapsedMs: Date.now() - startedAt,
    },
    runnerState,
    continuousEnabled,
  });

  return composeSnapshot({
    origin: "building",
    buildDurationMs: Date.now() - startedAt,
    appHealth,
    p159,
    productionReadiness,
    continuousEnabled,
    daemonRunning: appHealth.systemStatus.daemonRunning,
    serverStartTime: runnerState.serverStartTime,
    warnings: ["Snapshot warming up — first full refresh in progress"],
  });
}
