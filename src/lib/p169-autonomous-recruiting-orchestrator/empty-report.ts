import type { P169OperationsConsole } from "@/lib/p169-autonomous-recruiting-orchestrator/types";
import { P169_SOURCE_PHASE } from "@/lib/p169-autonomous-recruiting-orchestrator/types";

export function emptyP169OperationsConsole(): P169OperationsConsole {
  const now = new Date().toISOString();
  return {
    sourcePhase: P169_SOURCE_PHASE,
    generatedAt: now,
    readOnly: true,
    status: "paused",
    statusLabel: "Paused",
    enabled: false,
    paused: true,
    lastCycle: {
      at: null,
      agoLabel: "never",
      durationMs: null,
      candidatesEvaluated: 0,
      paperworkSent: 0,
      skipped: 0,
      exceptions: 0,
      dropboxRequests: null,
    },
    nextCycle: { at: null, inMs: null, inLabel: "—" },
    metrics: {
      candidatesEvaluated: 0,
      paperworkSent: 0,
      skipped: 0,
      exceptions: 0,
      readyForMel: 0,
      waitingSignature: 0,
      dropboxRequests: null,
    },
    dropbox: { currentBudget: 35, usedToday: 0, withinBudget: true },
    runner: { status: "unknown", healthy: false },
    scheduler: { recommendation: "UNKNOWN", nextRecommendedRunAt: null },
    health: { score: 0, label: "critical" },
    config: {
      enabled: false,
      paused: true,
      cycleIntervalMs: 7 * 60_000,
      maxSendsPerCycle: 10,
      dropboxBudgetReserve: 5,
      minimumConfidence: 80,
      maximumRetries: 3,
      exceptionThreshold: 25,
      readinessThreshold: 80,
      maintenanceWindows: [],
      pauseSchedule: { pausedUntil: null, reason: null },
      updatedAt: now,
    },
    recentCycles: [],
    warnings: ["Degraded empty orchestrator console"],
  };
}
