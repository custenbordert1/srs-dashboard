import { evaluateP171LifecycleGates } from "@/lib/p171-autonomous-candidate-lifecycle-manager/evaluate-lifecycle-gates";
import {
  loadP171CycleHistory,
  loadP171LifecycleState,
  listP171CandidateRecords,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-store";
import { summarizeP171Candidates } from "@/lib/p171-autonomous-candidate-lifecycle-manager/map-lifecycle-state";
import {
  P171_LIFECYCLE_STATE_ORDER,
  P171_SOURCE_PHASE,
  type P171LifecycleConsole,
  type P171LifecycleState,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";

function agoLabel(iso: string | null): string {
  if (!iso) return "never";
  const delta = Date.now() - Date.parse(iso);
  if (delta < 60_000) return "just now";
  const min = Math.round(delta / 60_000);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  return `${hr} hour${hr === 1 ? "" : "s"} ago`;
}

function formatInLabel(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 60_000) return "< 1 minute";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"}`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `${hr}h ${rem}m` : `${hr} hour${hr === 1 ? "" : "s"}`;
}

function healthLabel(score: number): "healthy" | "warning" | "critical" {
  if (score >= 75) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

function candidatesProcessedToday(records: ReturnType<typeof listP171CandidateRecords>): number {
  const today = new Date().toISOString().slice(0, 10);
  return records.filter((r) => r.updatedAt.slice(0, 10) === today).length;
}

export async function buildP171LifecycleConsole(): Promise<P171LifecycleConsole> {
  const state = await loadP171LifecycleState();
  const [history, gates] = await Promise.all([
    loadP171CycleHistory(),
    evaluateP171LifecycleGates(state.config),
  ]);

  const records = listP171CandidateRecords(state);
  const summary = summarizeP171Candidates(records);
  const last = state.lastCycle;
  const warnings: string[] = [];

  if (!state.config.enabled) {
    warnings.push("Lifecycle manager disabled — set P171_LIFECYCLE_ENABLED=true to enable.");
  }
  if (state.config.paused) {
    warnings.push("Lifecycle manager paused by administrator.");
  }
  if (state.consecutiveFailures >= state.config.maximumRetries) {
    warnings.push(
      `Failsafe active — ${state.consecutiveFailures} consecutive failures (threshold ${state.config.maximumRetries}).`,
    );
  }

  const stateDistribution = P171_LIFECYCLE_STATE_ORDER.map((lifecycleState) => ({
    state: lifecycleState as P171LifecycleState,
    count: records.filter((r) => r.state === lifecycleState).length,
  })).filter((entry) => entry.count > 0);

  const nextAt = state.nextCycleAt;
  const inMs = nextAt ? Math.max(0, Date.parse(nextAt) - Date.now()) : null;

  let status = state.status;
  let statusLabel = "Idle";
  if (!state.config.enabled || state.config.paused) {
    status = "paused";
    statusLabel = "Paused";
  } else if (state.processingLock) {
    status = "running";
    statusLabel = "Running";
  }

  return {
    sourcePhase: P171_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    readOnly: !state.config.enabled,
    status,
    statusLabel,
    enabled: state.config.enabled,
    paused: state.config.paused,
    lastCycle: {
      at: state.lastCycleAt,
      agoLabel: agoLabel(state.lastCycleAt),
      durationMs: last?.durationMs ?? null,
      candidatesProcessed: last?.candidatesProcessed ?? 0,
      paperworkSent: last?.paperworkSent ?? 0,
      remindersSent: last?.remindersSent ?? 0,
      exceptions: last?.exceptionsCreated ?? 0,
      readyForMel: last?.readyForMel ?? 0,
      waitingSignature: last?.waitingSignature ?? 0,
    },
    nextCycle: {
      at: nextAt,
      inMs,
      inLabel: formatInLabel(inMs),
    },
    metrics: {
      candidatesProcessedToday: candidatesProcessedToday(records),
      paperworkAutomaticallySent: last?.paperworkSent ?? summary.paperworkSent,
      readyForMel: summary.readyForMel,
      waitingSignature: summary.waitingSignature,
      averageCompletionTimeMs: last?.averageCompletionTimeMs ?? null,
      automationSuccessRate: last?.automationSuccessRate ?? summary.automationPercent,
      exceptionRate: last?.exceptionRate ?? summary.exceptionPercent,
      recruiterInterventionsSaved: summary.recruiterInterventionsSaved,
      discoveryLatencyMs: last?.discoveryLatencyMs ?? null,
      evaluationLatencyMs: last?.evaluationLatencyMs ?? null,
      paperworkLatencyMs: last?.paperworkLatencyMs ?? null,
      signatureLatencyMs: last?.signatureLatencyMs ?? null,
      automationPercent: summary.automationPercent,
      recruiterInterventionPercent: summary.exceptionPercent,
    },
    stateDistribution,
    health: {
      score: gates.healthScore,
      label: healthLabel(gates.healthScore),
    },
    config: state.config,
    recentCycles: history.slice(0, 10),
    warnings,
  };
}
