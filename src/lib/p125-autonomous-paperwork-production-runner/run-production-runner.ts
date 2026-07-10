import { runPaperworkCycle } from "@/lib/autonomous-paperwork-orchestrator/execute-paperwork-cycle";
import {
  isRetryablePaperworkError,
  nextRetryDelayMs,
} from "@/lib/autonomous-paperwork-orchestrator/retry-engine";
import { buildProductionRunnerSnapshot } from "@/lib/p125-autonomous-paperwork-production-runner/build-runner-snapshot";
import {
  resolveProductionRunnerConfig,
  shouldExecuteLive,
} from "@/lib/p125-autonomous-paperwork-production-runner/runner-config";
import {
  appendProductionRunnerAudit,
  bumpDailyFailure,
  bumpDailyProcessed,
  bumpDailySafetyBlocked,
  bumpDailySuccess,
  loadProductionRunnerState,
  recordDuplicatePrevention,
  releaseProductionRunnerLock,
  saveProductionRunnerState,
  touchProductionRunnerHeartbeat,
  tryAcquireProductionRunnerLock,
} from "@/lib/p125-autonomous-paperwork-production-runner/runner-store";
import {
  P125_SOURCE_PHASE,
  type ProductionRunnerCycleResult,
  type ProductionRunnerMode,
  type ProductionRunnerRetryEntry,
  type ProductionRunnerState,
} from "@/lib/p125-autonomous-paperwork-production-runner/types";

function dueRetries(state: ProductionRunnerState): ProductionRunnerRetryEntry[] {
  const now = Date.now();
  return state.retryQueue.filter((entry) => Date.parse(entry.nextRetryAt) <= now);
}

function scheduleRetry(
  state: ProductionRunnerState,
  input: { candidateId: string; candidateName: string; error: string; attempt: number },
): void {
  const delayMs = nextRetryDelayMs(input.attempt);
  const entry: ProductionRunnerRetryEntry = {
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    error: input.error,
    attempt: input.attempt + 1,
    nextRetryAt: new Date(Date.now() + delayMs).toISOString(),
    addedAt: new Date().toISOString(),
  };
  state.retryQueue = [
    ...state.retryQueue.filter((item) => item.candidateId !== input.candidateId),
    entry,
  ].slice(-50);
}

export async function runProductionRunnerCycle(input?: {
  mode?: ProductionRunnerMode;
  execute?: boolean;
  byUserId?: string;
  runPaperworkCycleFn?: typeof runPaperworkCycle;
}): Promise<ProductionRunnerCycleResult> {
  const config = resolveProductionRunnerConfig();
  const mode = input?.mode ?? config.defaultMode;
  const warnings: string[] = [
    "P125 — production runner (executeOne only via P122/P123).",
    "P125 — executeBatch is never used.",
    "P124 — only AUTO_APPROVED candidates enter send queue.",
    "P122 — safety gates remain enforced before live send.",
  ];

  if (mode === "paused") {
    const snapshot = await buildProductionRunnerSnapshot();
    return {
      ok: true,
      skippedOverlap: false,
      skippedPaused: true,
      mode,
      snapshot,
      warnings: [...warnings, "Runner is paused — no cycle executed."],
      executeBatchCalled: false,
    };
  }

  const lock = await tryAcquireProductionRunnerLock({ mode });
  if (!lock.acquired) {
    const snapshot = await buildProductionRunnerSnapshot();
    return {
      ok: true,
      skippedOverlap: true,
      skippedPaused: false,
      mode,
      snapshot,
      warnings: [...warnings, "Skipped — previous run still executing or runner paused."],
      executeBatchCalled: false,
    };
  }

  const started = Date.now();
  let success = false;
  let error: string | null = null;
  let cycleReport: Awaited<ReturnType<typeof runPaperworkCycle>>["report"] | null = null;

  try {
    await touchProductionRunnerHeartbeat();
    const state = await loadProductionRunnerState();
    const retryTarget = dueRetries(state)[0] ?? null;

    const execute = shouldExecuteLive({
      mode,
      config,
      explicitExecute: input?.execute,
    });

    const runCycle = input?.runPaperworkCycleFn ?? runPaperworkCycle;
    const cycleResult = await runCycle({
      dryRun: !execute,
      execute,
      confirmationPhrase: config.confirmationPhrase,
      candidateId: retryTarget?.candidateId,
      byUserId: input?.byUserId ?? "p125-production-runner",
    });
    cycleReport = cycleResult.report;

    if (cycleResult.executeBatchCalled) {
      throw new Error("executeBatch must never be called in P125 runner.");
    }

    const target = cycleReport.sendQueue.nextCandidate;
    bumpDailyProcessed(state);

    if (target && !recordDuplicatePrevention(state, target.candidateId) && execute) {
      bumpDailySafetyBlocked(state);
      warnings.push(`Duplicate prevention blocked ${target.candidateName}.`);
    } else if (cycleReport.execution.outcome === "sent" && target) {
      bumpDailySuccess(state);
      state.retryQueue = state.retryQueue.filter((entry) => entry.candidateId !== target.candidateId);
      recordDuplicatePrevention(state, target.candidateId);
    } else if (cycleReport.safetyState.goNoGo === "NO-GO" && target) {
      bumpDailySafetyBlocked(state);
      warnings.push(`Safety gate blocked ${target.candidateName}: ${cycleReport.safetyState.reason}`);
    } else if (cycleReport.execution.error && target) {
      const retryable = isRetryablePaperworkError(cycleReport.execution.error);
      if (retryable) {
        scheduleRetry(state, {
          candidateId: target.candidateId,
          candidateName: target.candidateName,
          error: cycleReport.execution.error,
          attempt: cycleReport.execution.retryAttempt,
        });
        warnings.push(`Transient failure — retry scheduled for ${target.candidateName}.`);
      } else {
        bumpDailyFailure(state);
        state.recentFailures = [
          {
            candidateId: target.candidateId,
            candidateName: target.candidateName,
            error: cycleReport.execution.error,
            failedAt: new Date().toISOString(),
            attempt: cycleReport.execution.retryAttempt,
          },
          ...state.recentFailures,
        ].slice(0, 25);
      }
    }

    await saveProductionRunnerState(state);
    success = cycleResult.report.execution.outcome !== "failed";
    error = cycleResult.report.execution.error;

    const durationMs = Date.now() - started;
    await releaseProductionRunnerLock({ runId: lock.runId, success, error, durationMs });
    await appendProductionRunnerAudit({
      action: "cycle",
      mode,
      execute,
      success,
      durationMs,
      candidateId: target?.candidateId ?? null,
      outcome: cycleReport.execution.outcome,
      queueDepth: cycleReport.sendQueue.queueDepth,
      safetyGoNoGo: cycleReport.safetyState.goNoGo,
      executeBatchCalled: false,
    });

    const snapshot = await buildProductionRunnerSnapshot({ lastCycle: cycleReport });
    return {
      ok: success,
      skippedOverlap: false,
      skippedPaused: false,
      mode,
      snapshot,
      warnings,
      executeBatchCalled: false,
    };
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    const durationMs = Date.now() - started;
    await releaseProductionRunnerLock({ runId: lock.runId, success: false, error, durationMs });
    await appendProductionRunnerAudit({ action: "cycle", mode, success: false, error, durationMs });
    const snapshot = await buildProductionRunnerSnapshot({ lastCycle: cycleReport });
    return {
      ok: false,
      skippedOverlap: false,
      skippedPaused: false,
      mode,
      snapshot,
      warnings: [...warnings, error],
      executeBatchCalled: false,
    };
  }
}

export async function startProductionRunner(input?: {
  intervalMs?: number;
  mode?: "continuous" | "oneCycle";
}): Promise<ProductionRunnerState> {
  const state = await loadProductionRunnerState();
  state.continuousEnabled = input?.mode !== "oneCycle";
  state.schedulerMode = input?.mode === "oneCycle" ? "oneCycle" : "continuous";
  state.runnerStatus = "idle";
  state.startedAt = state.startedAt ?? new Date().toISOString();
  state.uptimeStartedAt = state.uptimeStartedAt ?? new Date().toISOString();
  if (input?.intervalMs) state.scheduleIntervalMs = input.intervalMs;
  state.nextScheduledRunAt = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  await saveProductionRunnerState(state);
  await appendProductionRunnerAudit({
    action: "start",
    mode: state.schedulerMode,
    intervalMs: state.scheduleIntervalMs,
  });
  return state;
}

export async function pauseProductionRunner(): Promise<ProductionRunnerState> {
  const state = await loadProductionRunnerState();
  state.schedulerMode = "paused";
  state.runnerStatus = state.processingLock ? "running" : "paused";
  await saveProductionRunnerState(state);
  await appendProductionRunnerAudit({ action: "pause" });
  return state;
}

export async function resumeProductionRunner(): Promise<ProductionRunnerState> {
  const state = await loadProductionRunnerState();
  state.schedulerMode = state.continuousEnabled ? "continuous" : "manual";
  state.runnerStatus = state.processingLock ? "running" : "idle";
  state.nextScheduledRunAt = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  await saveProductionRunnerState(state);
  await appendProductionRunnerAudit({ action: "resume" });
  return state;
}

export async function stopProductionRunner(): Promise<ProductionRunnerState> {
  const state = await loadProductionRunnerState();
  state.continuousEnabled = false;
  state.schedulerMode = "stopped";
  state.runnerStatus = state.processingLock ? "running" : "stopped";
  state.nextScheduledRunAt = null;
  await saveProductionRunnerState(state);
  await appendProductionRunnerAudit({ action: "stop" });
  return state;
}

export async function buildProductionRunnerReport(): Promise<ProductionRunnerCycleResult["snapshot"]> {
  return buildProductionRunnerSnapshot();
}

export { P125_SOURCE_PHASE };
