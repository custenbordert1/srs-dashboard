import { buildP168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/approval-engine";
import { evaluateRunNextBatchGates } from "@/lib/p168-executive-approval/build-approval-recommendation";
import { buildP167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler";
import { gatherP167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type { P169OrchestratorConfig } from "@/lib/p169-autonomous-recruiting-orchestrator/types";

export type P169CycleGateEvaluation = {
  pass: boolean;
  blockingFactors: string[];
  schedulerRecommendation: string;
  approvalAction: string;
  readinessScore: number | null;
  runnerHealthy: boolean;
  runnerStatus: string;
  dropboxWithinBudget: boolean;
  healthScore: number;
};

export async function evaluateP169CycleGates(
  config: P169OrchestratorConfig,
): Promise<P169CycleGateEvaluation> {
  const [scheduler, ctx, approval] = await Promise.all([
    buildP167ProductionSchedulerReport(),
    gatherP167SchedulerContext(),
    buildP168ExecutiveApprovalReport(),
  ]);

  const gates = evaluateRunNextBatchGates(ctx);
  const blockingFactors = [...gates.blockingFactors];

  if (ctx.readinessScore != null && ctx.readinessScore <= config.readinessThreshold) {
    if (!blockingFactors.some((f) => f.includes("readiness"))) {
      blockingFactors.push(
        `Production readiness ${ctx.readinessScore} below P169 threshold ${config.readinessThreshold}`,
      );
    }
  }

  if (approval.recommendation.action !== "RUN_NEXT_BATCH") {
    blockingFactors.push(`Executive approval recommendation is ${approval.recommendation.action}`);
  }

  const schedulerReady = scheduler.decision.recommendation === "READY_NOW";
  if (!schedulerReady) {
    blockingFactors.push(`Scheduler recommends ${scheduler.decision.recommendation}`);
  }

  const readinessScore =
    ctx.readinessScore ?? scheduler.context.productionReadinessScore ?? null;
  const dropboxWithinBudget = approval.recommendation.expectedDropboxApiRequests <= 35;

  let healthScore = 100;
  if (!ctx.health.healthy) healthScore -= 25;
  if (!dropboxWithinBudget) healthScore -= 15;
  if (readinessScore != null && readinessScore <= config.readinessThreshold) healthScore -= 20;
  if (blockingFactors.length > 0) healthScore -= Math.min(30, blockingFactors.length * 5);
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    pass: blockingFactors.length === 0,
    blockingFactors,
    schedulerRecommendation: scheduler.decision.recommendation,
    approvalAction: approval.recommendation.action,
    readinessScore,
    runnerHealthy: ctx.health.healthy,
    runnerStatus: ctx.runner.currentStatus,
    dropboxWithinBudget,
    healthScore,
  };
}
