import { evaluateP169CycleGates } from "@/lib/p169-autonomous-recruiting-orchestrator/evaluate-cycle-gates";
import type { P171LifecycleConfig } from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";

export type P171LifecycleGateEvaluation = {
  pass: boolean;
  blockingFactors: string[];
  warnings: string[];
  schedulerRecommendation: string;
  approvalAction: string;
  runnerHealthy: boolean;
  runnerStatus: string;
  healthScore: number;
};

/**
 * Reuses P169 safety gates — P171 does not duplicate gate logic.
 */
export async function evaluateP171LifecycleGates(
  config: P171LifecycleConfig,
): Promise<P171LifecycleGateEvaluation> {
  const gates = await evaluateP169CycleGates({
    enabled: true,
    paused: false,
    cycleIntervalMs: config.cycleIntervalMs,
    maxSendsPerCycle: 10,
    dropboxBudgetReserve: 5,
    minimumConfidence: config.minimumConfidence,
    maximumRetries: config.maximumRetries,
    exceptionThreshold: config.exceptionThreshold,
    readinessThreshold: config.readinessThreshold,
    maintenanceWindows: [],
    pauseSchedule: { pausedUntil: null, reason: null },
    updatedAt: config.updatedAt,
  });

  return {
    pass: gates.pass,
    blockingFactors: gates.blockingFactors,
    warnings: gates.warnings,
    schedulerRecommendation: gates.schedulerRecommendation,
    approvalAction: gates.approvalAction,
    runnerHealthy: gates.runnerHealthy,
    runnerStatus: gates.runnerStatus,
    healthScore: gates.healthScore,
  };
}
