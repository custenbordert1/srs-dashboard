import { buildP168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/approval-engine";
import { buildP167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler";
import { gatherP167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import { evaluateSendCycleGatesFromContext } from "@/lib/p179-operator-controlled-send-gate-profile/evaluate-send-cycle-gates";
import type { P169OrchestratorConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/types";

export type P169CycleGateEvaluation = {
  pass: boolean;
  blockingFactors: string[];
  warnings: string[];
  schedulerRecommendation: string;
  approvalAction: string;
  readinessScore: number | null;
  runnerHealthy: boolean;
  runnerStatus: string;
  dropboxWithinBudget: boolean;
  healthScore: number;
  gateProfile: "autonomous";
};

/**
 * P169/P171 autonomous cycles always use the strict autonomous gate profile.
 */
export async function evaluateP169CycleGates(
  config: P169OrchestratorConfig,
): Promise<P169CycleGateEvaluation> {
  const [scheduler, ctx, approval] = await Promise.all([
    buildP167ProductionSchedulerReport(),
    gatherP167SchedulerContext(),
    buildP168ExecutiveApprovalReport(),
  ]);

  const gates = evaluateSendCycleGatesFromContext({
    profile: "autonomous",
    ctx,
    scheduler,
    approvalAction: approval.recommendation.action,
    readinessThreshold: config.readinessThreshold,
  });

  return {
    pass: gates.pass,
    blockingFactors: gates.blockingFactors,
    warnings: gates.warnings,
    schedulerRecommendation: gates.schedulerRecommendation,
    approvalAction: gates.approvalAction,
    readinessScore: gates.readinessScore,
    runnerHealthy: gates.runnerHealthy,
    runnerStatus: gates.runnerStatus,
    dropboxWithinBudget: gates.dropboxWithinBudget,
    healthScore: gates.healthScore,
    gateProfile: "autonomous",
  };
}
