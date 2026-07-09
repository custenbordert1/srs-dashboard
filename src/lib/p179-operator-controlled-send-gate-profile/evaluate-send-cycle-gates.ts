import { buildP168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/approval-engine";
import { buildP167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler";
import { gatherP167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type { P167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import type { P167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler/types";
import type { P168ApprovalAction } from "@/lib/p168-executive-approval/approval-types";
import { classifySendCycleGateFactors } from "@/lib/p179-operator-controlled-send-gate-profile/classify-gate-factors";
import { collectSendCycleGateFactors } from "@/lib/p179-operator-controlled-send-gate-profile/collect-send-cycle-gate-factors";
import type { SendCycleGateEvaluation, SendGateProfile } from "@/lib/p179-operator-controlled-send-gate-profile/types";

export function evaluateSendCycleGatesFromContext(input: {
  profile: SendGateProfile;
  ctx: P167SchedulerContext;
  scheduler: P167ProductionSchedulerReport;
  approvalAction: P168ApprovalAction;
  readinessThreshold?: number;
}): SendCycleGateEvaluation {
  const factors = collectSendCycleGateFactors({
    ctx: input.ctx,
    scheduler: input.scheduler,
    approvalAction: input.approvalAction,
    readinessThreshold: input.readinessThreshold,
  });
  const classified = classifySendCycleGateFactors(factors, input.profile);

  const readinessScore =
    input.ctx.readinessScore ?? input.scheduler.context.productionReadinessScore ?? null;
  const dropboxWithinBudget = input.scheduler.decision.projectedDropboxApiUsage.withinBudget;

  let healthScore = 100;
  if (!input.ctx.health.healthy) healthScore -= 25;
  if (!dropboxWithinBudget) healthScore -= 15;
  if (readinessScore != null && input.readinessThreshold != null && readinessScore <= input.readinessThreshold) {
    healthScore -= input.profile === "operator" ? 5 : 20;
  }
  if (classified.blockingFactors.length > 0) {
    healthScore -= Math.min(30, classified.blockingFactors.length * 5);
  }
  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    profile: input.profile,
    pass: classified.pass,
    blockingFactors: classified.blockingFactors,
    warnings: classified.warnings,
    schedulerRecommendation: input.scheduler.decision.recommendation,
    approvalAction: input.approvalAction,
    readinessScore,
    runnerHealthy: input.ctx.health.healthy,
    runnerStatus: input.ctx.runner.currentStatus,
    dropboxWithinBudget,
    healthScore,
  };
}

export async function evaluateSendCycleGates(input: {
  profile: SendGateProfile;
  readinessThreshold?: number;
}): Promise<SendCycleGateEvaluation> {
  const [scheduler, ctx, approval] = await Promise.all([
    buildP167ProductionSchedulerReport(),
    gatherP167SchedulerContext(),
    buildP168ExecutiveApprovalReport(),
  ]);

  return evaluateSendCycleGatesFromContext({
    profile: input.profile,
    ctx,
    scheduler,
    approvalAction: approval.recommendation.action,
    readinessThreshold: input.readinessThreshold,
  });
}
