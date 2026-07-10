import { getDropboxSignApiMetricsSnapshot } from "@/lib/dropbox-sign-api";
import { evaluateP169CycleGates } from "@/lib/p169-autonomous-recruiting-orchestrator/evaluate-cycle-gates";
import {
  loadP169CycleHistory,
  loadP169OrchestratorState,
} from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-store";
import {
  P169_SOURCE_PHASE,
  type P169OperationsConsole,
} from "@/lib/p169-autonomous-recruiting-orchestrator/types";

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

export async function buildP169OperationsConsole(): Promise<P169OperationsConsole> {
  const state = await loadP169OrchestratorState();
  const [history, gates] = await Promise.all([
    loadP169CycleHistory(),
    evaluateP169CycleGates(state.config),
  ]);

  const warnings: string[] = [];
  if (!state.config.enabled) {
    warnings.push("Autonomous orchestrator is disabled — set P169_ORCHESTRATOR_ENABLED=true to enable.");
  }
  if (state.config.paused) {
    warnings.push("Orchestrator is paused by administrator.");
  }
  if (state.consecutiveFailures >= state.config.maximumRetries) {
    warnings.push(
      `Failsafe active — ${state.consecutiveFailures} consecutive failures (threshold ${state.config.maximumRetries}).`,
    );
  }
  if (state.executiveAlertRaisedAt) {
    warnings.push(`Executive alert raised at ${state.executiveAlertRaisedAt}.`);
  }

  const last = state.lastCycle;
  const dropbox = getDropboxSignApiMetricsSnapshot();
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
  } else {
    statusLabel = "Idle";
  }

  return {
    sourcePhase: P169_SOURCE_PHASE,
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
      candidatesEvaluated: last?.candidatesEvaluated ?? 0,
      paperworkSent: last?.candidatesSent ?? last?.paperworkSent ?? 0,
      skipped: last?.candidatesSkipped ?? 0,
      exceptions: last?.exceptionsCreated ?? 0,
      dropboxRequests: last?.dropboxRequests ?? null,
    },
    nextCycle: {
      at: nextAt,
      inMs,
      inLabel: formatInLabel(inMs),
    },
    metrics: {
      candidatesEvaluated: last?.candidatesEvaluated ?? 0,
      paperworkSent: last?.candidatesSent ?? 0,
      skipped: last?.candidatesSkipped ?? 0,
      exceptions: last?.exceptionsCreated ?? 0,
      readyForMel: last?.readyForMel ?? 0,
      waitingSignature: last?.waitingSignature ?? 0,
      dropboxRequests: last?.dropboxRequests ?? null,
    },
    dropbox: {
      currentBudget: 35,
      usedToday: dropbox.totalRequests,
      withinBudget: gates.dropboxWithinBudget,
    },
    runner: {
      status: gates.runnerStatus,
      healthy: gates.runnerHealthy,
    },
    scheduler: {
      recommendation: gates.schedulerRecommendation,
      nextRecommendedRunAt: state.nextCycleAt,
    },
    health: {
      score: gates.healthScore,
      label: healthLabel(gates.healthScore),
    },
    config: state.config,
    recentCycles: history.slice(0, 10),
    warnings,
  };
}
