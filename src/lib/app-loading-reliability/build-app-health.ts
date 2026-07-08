import {
  P161_APP_HEALTH_TIMEOUT_MS,
  P161_MAJOR_PAGES,
  P161_SOURCE_PHASE,
} from "@/lib/app-loading-reliability/constants";
import { withRequestTimeout } from "@/lib/app-loading-reliability/request-timeout";
import {
  collectDegradedSectionIds,
  deriveSectionHealth,
  type SectionHealth,
} from "@/lib/app-loading-reliability/section-health";
import { buildP159OperationsControlCenter } from "@/lib/p159-operations-control-center";
import type { P159DashboardBuildResult as P159BuildResult } from "@/lib/p159-operations-control-center/build-operations-control-center";
import { buildP160ProductionReadiness } from "@/lib/p160-production-readiness";
import type { P160ProductionReadinessReport } from "@/lib/p160-production-readiness/types";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import { loadP1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store";
import type { P1547RunnerState } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

export type P161OperatingMode = {
  label: string;
  continuousEnabled: boolean;
  daemonRunning: boolean;
  systemMode: string;
  observationMode: boolean;
};

export type P161SystemStatusSnapshot = {
  paperworkSentToday: number;
  sendBatchesToday: number;
  failuresToday: number;
  eligibleNow: number;
  queueRemaining: number;
  lastProductionCycle: string | null;
  readinessScore: number | null;
  daemonRunning: boolean;
};

export type P161AppHealthReport = {
  sourcePhase: typeof P161_SOURCE_PHASE;
  generatedAt: string;
  operatingMode: P161OperatingMode;
  systemStatus: P161SystemStatusSnapshot;
  pageHealth: SectionHealth[];
  apiHealth: SectionHealth[];
  slowEndpoints: string[];
  degradedSections: string[];
  lastSuccessfulDataTimestamps: Record<string, string | null>;
  warnings: string[];
};

const PAGE_LABELS: Record<(typeof P161_MAJOR_PAGES)[number], string> = {
  "command-center": "Command Center",
  "executive-home": "Executive Home",
  operations: "Operations",
  "territory-field": "Territory / Field",
  "admin-data": "Admin / Data",
  "workforce-intelligence": "Workforce Intelligence",
  "recruiting-autopilot": "Recruiting Autopilot",
  "autopilot-ops": "Autopilot Ops",
  "execution-center": "Execution Center",
  "hiring-placement": "Hiring & Placement",
  "operations-control-center": "Operations Control Center",
  "production-readiness": "Production Readiness",
  "recruiting-priorities": "Recruiting Priorities",
  "recruiting-decisions": "Recruiting Decisions",
  "recruiter-assignment-center": "Recruiter Assignment Center",
};

function defaultSystemStatus(): P161SystemStatusSnapshot {
  return {
    paperworkSentToday: 0,
    sendBatchesToday: 0,
    failuresToday: 0,
    eligibleNow: 0,
    queueRemaining: 0,
    lastProductionCycle: null,
    readinessScore: null,
    daemonRunning: false,
  };
}

type P161ProbeResult<T> = {
  value: T | null;
  error: string | null;
  timedOut: boolean;
  elapsedMs: number;
};

type P161AppHealthInputs = {
  p159Result: P161ProbeResult<P159BuildResult>;
  p160Result: P161ProbeResult<P160ProductionReadinessReport>;
  runnerState: P1547RunnerState;
  continuousEnabled: boolean;
};

/**
 * Composes the app-health report from already-built P159/P160 results.
 * Used by the P161.1 snapshot builder so the pipeline runs exactly once.
 */
export function composeP161AppHealthReport(inputs: P161AppHealthInputs): P161AppHealthReport {
  const { p159Result, p160Result, runnerState, continuousEnabled } = inputs;
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];

  if (p159Result.error) warnings.push(p159Result.error);
  if (p160Result.error) warnings.push(p160Result.error);

  const p159 = p159Result.value;
  const p160 = p160Result.value;

  const daemonRunning =
    p159?.dashboard.runner.daemonRunning ??
    (continuousEnabled &&
      runnerState.continuousEnabled &&
      runnerState.schedulerMode === "continuous" &&
      runnerState.currentStatus !== "stopped" &&
      runnerState.serverStartTime !== null);
  const systemMode = p159?.dashboard.runner.systemMode ?? "manual_only";

  const operatingMode: P161OperatingMode = {
    label: continuousEnabled
      ? "Continuous automation enabled"
      : daemonRunning
        ? "Daemon running (continuous off)"
        : "Observation mode • Manual batches • Continuous automation OFF",
    continuousEnabled,
    daemonRunning,
    systemMode,
    observationMode: !continuousEnabled,
  };

  const systemStatus: P161SystemStatusSnapshot = p159
    ? {
        paperworkSentToday: p159.dashboard.today.paperworkSent,
        sendBatchesToday: p159.dashboard.today.sendBatchCount,
        failuresToday: p159.dashboard.today.failures,
        eligibleNow: p159.dashboard.queue.eligibleNow,
        queueRemaining: p159.dashboard.queue.queueRemaining,
        lastProductionCycle: p159.dashboard.runner.lastCycleAt,
        readinessScore: p160?.overallReadinessScore ?? null,
        daemonRunning,
      }
    : {
        ...defaultSystemStatus(),
        readinessScore: p160?.overallReadinessScore ?? null,
        daemonRunning,
      };

  const apiHealth: SectionHealth[] = [
    deriveSectionHealth({
      id: "api-operations-control-center",
      label: "/api/recruiting/operations-control-center",
      error: p159Result.error,
      stale: p159Result.timedOut,
      lastSuccessAt: p159?.dashboard.generatedAt ?? null,
      elapsedMs: p159Result.elapsedMs,
    }),
    deriveSectionHealth({
      id: "api-production-readiness",
      label: "/api/recruiting/production-readiness",
      error: p160Result.error,
      stale: p160Result.timedOut,
      lastSuccessAt: p160?.generatedAt ?? null,
      elapsedMs: p160Result.elapsedMs,
    }),
  ];

  const slowEndpoints = apiHealth
    .filter((s) => (s.elapsedMs ?? 0) > 8_000 || s.status === "timeout")
    .map((s) => s.label);

  const pageHealth: SectionHealth[] = P161_MAJOR_PAGES.map((pageId) => {
    const hardened =
      pageId === "operations-control-center" ||
      pageId === "production-readiness" ||
      pageId === "executive-home" ||
      pageId === "recruiting-autopilot" ||
      pageId === "recruiter-assignment-center";

    let status: SectionHealth["status"] = "healthy";
    let warning: string | null = null;

    if (!hardened) {
      status = "degraded";
      warning = "Pending P161 resilient shell migration";
    } else if (pageId === "operations-control-center" && p159Result.timedOut) {
      status = "stale";
      warning = "P159 probe timed out";
    } else if (pageId === "production-readiness" && p160Result.timedOut) {
      status = "stale";
      warning = "P160 probe timed out";
    }

    return {
      id: pageId,
      label: PAGE_LABELS[pageId],
      status,
      lastSuccessAt:
        pageId === "operations-control-center"
          ? (p159?.dashboard.generatedAt ?? null)
          : pageId === "production-readiness"
            ? (p160?.generatedAt ?? null)
            : generatedAt,
      error: null,
      warning,
      elapsedMs: null,
    };
  });

  const lastSuccessfulDataTimestamps: Record<string, string | null> = {
    p159: p159?.dashboard.generatedAt ?? null,
    p160: p160?.generatedAt ?? null,
    runner: runnerState.lastSuccessfulRun ?? runnerState.lastRun ?? null,
  };

  return {
    sourcePhase: P161_SOURCE_PHASE,
    generatedAt,
    operatingMode,
    systemStatus,
    pageHealth,
    apiHealth,
    slowEndpoints,
    degradedSections: collectDegradedSectionIds([...pageHealth, ...apiHealth]),
    lastSuccessfulDataTimestamps,
    warnings,
  };
}

/**
 * Standalone app-health build (runs P159 + P160 with timeouts).
 *
 * NOTE: This recomputes the full pipeline (~18–20s) and is retained for
 * backwards compatibility. The executive snapshot layer (P161.1) should be
 * preferred — it builds P159/P160 once and calls `composeP161AppHealthReport`.
 */
export async function buildP161AppHealthReport(): Promise<P161AppHealthReport> {
  const continuousEnabled = isP154ContinuousEnabled();
  const runnerState = await loadP1547RunnerState();

  const p159Result = await withRequestTimeout({
    label: "P159 operations control center",
    promise: buildP159OperationsControlCenter(),
    timeoutMs: P161_APP_HEALTH_TIMEOUT_MS,
    fallback: null,
  });

  const p160Result = await withRequestTimeout({
    label: "P160 production readiness",
    promise: buildP160ProductionReadiness(),
    timeoutMs: P161_APP_HEALTH_TIMEOUT_MS,
    fallback: null,
  });

  return composeP161AppHealthReport({
    p159Result,
    p160Result,
    runnerState,
    continuousEnabled,
  });
}
