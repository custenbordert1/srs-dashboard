import type { PaperworkCycleReport } from "@/lib/autonomous-paperwork-orchestrator/types";
import {
  isHeartbeatStale,
  loadProductionRunnerState,
} from "@/lib/p125-autonomous-paperwork-production-runner/runner-store";
import {
  P125_SOURCE_PHASE,
  type ProductionRunnerMetrics,
  type ProductionRunnerSnapshot,
  type ProductionRunnerState,
} from "@/lib/p125-autonomous-paperwork-production-runner/types";

export function buildProductionRunnerMetrics(
  state: ProductionRunnerState,
  cycle: PaperworkCycleReport | null,
): ProductionRunnerMetrics {
  const uptimeMs =
    state.uptimeStartedAt == null ? 0 : Math.max(0, Date.now() - Date.parse(state.uptimeStartedAt));

  return {
    queueDepth: cycle?.sendQueue.queueDepth ?? 0,
    candidatesProcessedToday: state.dailyMetrics.candidatesProcessed,
    successfulSends: state.dailyMetrics.successfulSends,
    failedSends: state.dailyMetrics.failedSends,
    safetyBlocked: state.dailyMetrics.safetyBlocked,
    averageProcessingTimeMs: state.averageProcessingTimeMs,
    retryQueueDepth: state.retryQueue.length,
    uptimeMs,
  };
}

export async function buildProductionRunnerSnapshot(input?: {
  lastCycle?: PaperworkCycleReport | null;
}): Promise<ProductionRunnerSnapshot> {
  const state = await loadProductionRunnerState();
  const cycle = input?.lastCycle ?? null;
  const nextCandidate = cycle?.sendQueue.nextCandidate ?? null;

  return {
    sourcePhase: P125_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    sectionTitle: "Autonomous Runner",
    mode: state.schedulerMode,
    status: state.runnerStatus,
    state,
    metrics: buildProductionRunnerMetrics(state, cycle),
    currentCandidate: nextCandidate
      ? {
          candidateId: nextCandidate.candidateId,
          candidateName: nextCandidate.candidateName,
          approvalDecision: nextCandidate.approvalDecision,
          approvalScore: nextCandidate.approvalScore,
        }
      : null,
    queue: (cycle?.sendQueue.remainingQueue ?? []).slice(0, 10).map((candidate) => ({
      candidateId: candidate.candidateId,
      candidateName: candidate.candidateName,
      approvalDecision: candidate.approvalDecision,
      approvalScore: candidate.approvalScore,
      safeToSend: candidate.safeToSend,
    })),
    safetyStatus: cycle
      ? {
          goNoGo: cycle.safetyState.goNoGo,
          reason: cycle.safetyState.reason,
          checks: cycle.safetyState.checks,
        }
      : {
          goNoGo: "NO-GO",
          reason: "No cycle evaluated yet.",
          checks: [],
        },
    lastCycle: cycle,
    failures: state.recentFailures.slice(0, 10),
    retries: state.retryQueue.slice(0, 10),
    heartbeat: {
      lastAt: state.lastHeartbeatAt,
      stale: isHeartbeatStale(state),
      healthy: !state.lastError && !isHeartbeatStale(state),
    },
    lastExecutionAt: cycle?.lastExecutionAt ?? state.lastSuccessfulRunAt,
    nextExecutionAt: state.nextScheduledRunAt,
    executeBatchCalled: false,
  };
}
