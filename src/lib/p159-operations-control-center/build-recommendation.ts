import { verifyAutopilotSystemHealth } from "@/lib/p154-controlled-production-autopilot-activation/verify-system-health";
import { isP154ControlledProductionAutopilotEnabled } from "@/lib/p154-controlled-production-autopilot-activation/execute-controlled-production-autopilot";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import type {
  P159Recommendation,
  P159RunnerStatusSection,
  P159SystemMode,
  P159TodayActivitySection,
} from "@/lib/p159-operations-control-center/types";

export function resolveP159SystemMode(input: {
  paused: boolean;
  continuousEnabled: boolean;
  schedulerMode: string;
  currentStatus: string;
  daemonRunning: boolean;
  processingLockHeld: boolean;
  staleLockWarning: boolean;
  failures: number;
  healthy: boolean;
  warnings: string[];
}): P159SystemMode {
  if (input.paused || input.schedulerMode === "paused") return "paused";
  if (input.currentStatus === "running" || (input.processingLockHeld && !input.staleLockWarning)) {
    return "running";
  }
  if (!input.healthy || input.failures > 0) return "blocked";
  if (input.staleLockWarning || input.warnings.length > 0) return "degraded";
  if (input.daemonRunning) return "running";
  if (!input.continuousEnabled) return "manual_only";
  return "ready";
}

export function buildP159Recommendation(input: {
  systemMode: P159SystemMode;
  healthy: boolean;
  failures: number;
  today: P159TodayActivitySection;
  queueRemaining: number;
  eligibleNow: number;
  continuousEnabled: boolean;
  autopilotEnabled: boolean;
}): { recommendation: P159Recommendation; detail: string } {
  if (input.failures > 0 || input.systemMode === "blocked") {
    return {
      recommendation: "pause_due_to_failures",
      detail:
        "Recent cycle failures or health checks failed. Resolve errors before another live batch.",
    };
  }

  if (!input.healthy) {
    return {
      recommendation: "not_ready_for_autonomous_sending",
      detail: "System health checks are not passing. Do not run live cycles until dependencies recover.",
    };
  }

  if (input.systemMode === "running") {
    return {
      recommendation: "continue_manual_batches",
      detail: "A cycle is in progress. Wait for completion before triggering another batch.",
    };
  }

  if (input.continuousEnabled && input.autopilotEnabled && input.failures === 0) {
    return {
      recommendation: "ready_for_continuous_observation",
      detail:
        "Continuous mode flag is enabled on the host. Deploy daemon with monitoring before enabling unsupervised polling.",
    };
  }

  if (
    input.eligibleNow > 0 &&
    input.today.paperworkSent > 0 &&
    input.today.failures === 0 &&
    input.systemMode !== "paused"
  ) {
    return {
      recommendation: "safe_for_capped_cycle",
      detail: `Manual batches are working (${input.today.paperworkSent} sent today). Up to 10 more sends available in the next capped cycle.`,
    };
  }

  if (
    input.today.paperworkSent === 0 &&
    input.queueRemaining > 0 &&
    !input.continuousEnabled
  ) {
    return {
      recommendation: "ready_for_server_deployment",
      detail:
        "Continuous infrastructure is built but disabled. Deploy P154.7 daemon on server with monitoring before enabling polling.",
    };
  }

  if (input.today.sendBatchCount > 0 && !input.continuousEnabled) {
    return {
      recommendation: "continue_manual_batches",
      detail:
        "Production is operating in manual capped-batch mode. Continue operator-triggered cycles until continuous observation is approved.",
    };
  }

  return {
    recommendation: "not_ready_for_autonomous_sending",
    detail: "No eligible send queue or prerequisites missing. Review queue status before live sends.",
  };
}

export function isP159DaemonRunning(
  input: {
    continuousEnabled: boolean;
    schedulerMode: string;
    currentStatus: string;
    serverStartTime: string | null;
  },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    isP154ContinuousEnabled(env) &&
    input.continuousEnabled &&
    input.schedulerMode === "continuous" &&
    input.currentStatus !== "stopped" &&
    input.serverStartTime !== null
  );
}

export async function buildP159RunnerStatus(input: {
  warnings: string[];
  failures: number;
}): Promise<P159RunnerStatusSection> {
  const { loadAutopilotState } = await import(
    "@/lib/p154-controlled-production-autopilot-activation/autopilot-store"
  );
  const { buildP1547AutopilotStatus } = await import(
    "@/lib/p154-continuous-autonomous-recruiting-runner/build-autopilot-status"
  );
  const { loadP1547RunnerState, isP1547LockStale } = await import(
    "@/lib/p154-continuous-autonomous-recruiting-runner/runner-store"
  );
  const {
    getP154IntervalMinutes,
    getP154MaxAssignmentsPerCycle,
    getP154MaxPaperworkSendsPerCycle,
    isP154ContinuousEnabled,
  } = await import("@/lib/p154-continuous-autonomous-recruiting-runner/runner-config");

  const [p1547, runner, autopilot, health] = await Promise.all([
    buildP1547AutopilotStatus(),
    loadP1547RunnerState(),
    loadAutopilotState(),
    verifyAutopilotSystemHealth(),
  ]);

  const lock = runner.processingLock;
  const lockAgeMs = lock ? Date.now() - Date.parse(lock.lockedAt) : null;
  const staleLockWarning = lock !== null && isP1547LockStale(lock);
  const continuousEnabled = isP154ContinuousEnabled();
  const daemonRunning = isP159DaemonRunning({
    continuousEnabled: runner.continuousEnabled,
    schedulerMode: runner.schedulerMode,
    currentStatus: runner.currentStatus,
    serverStartTime: runner.serverStartTime,
  });

  const systemMode = resolveP159SystemMode({
    paused: autopilot.paused,
    continuousEnabled,
    schedulerMode: runner.schedulerMode,
    currentStatus: runner.currentStatus,
    daemonRunning,
    processingLockHeld: lock !== null,
    staleLockWarning,
    failures: input.failures,
    healthy: health.healthy,
    warnings: input.warnings,
  });

  return {
    systemMode,
    continuousEnabled,
    schedulerMode: runner.schedulerMode,
    daemonRunning,
    autopilotEnabled: isP154ControlledProductionAutopilotEnabled(),
    lastCycleAt: runner.lastRun ?? autopilot.lastCycleAt,
    nextCycleAt: runner.nextRun,
    intervalMinutes: getP154IntervalMinutes(),
    uptimeMs: p1547.uptimeMs,
    serverStartTime: p1547.serverStartTime,
    processingLockHeld: lock !== null,
    lockRunId: lock?.runId ?? null,
    lockAgeMs,
    staleLockWarning,
    lastError: runner.lastError ?? autopilot.lastError,
    maxSendsPerCycle: getP154MaxPaperworkSendsPerCycle(),
    maxAssignmentsPerCycle: getP154MaxAssignmentsPerCycle(),
  };
}
