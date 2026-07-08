import { getCachedSnapshot } from "@/lib/app-performance/snapshot-cache";
import { buildP159OperationsControlCenter } from "@/lib/p159-operations-control-center/build-operations-control-center";
import { buildP168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/approval-engine";
import { evaluateRunNextBatchGates } from "@/lib/p168-executive-approval/build-approval-recommendation";
import { gatherP167SchedulerContext } from "@/lib/p167-intelligent-production-scheduler/gather-scheduler-context";
import { buildP167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler";
import {
  buildGateChecklist,
  resolveActionRequiredBeforeApproval,
  resolveApproveDisabledReason,
} from "@/lib/p168.1-executive-decision-center/build-gate-checklist";
import { computeExecutiveDecisionScore } from "@/lib/p168.1-executive-decision-center/compute-decision-score";
import type { P1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/types";
import { P168_1_SOURCE_PHASE } from "@/lib/p168.1-executive-decision-center/types";
import { actionLabel } from "@/lib/p168-executive-approval/presentation";

export async function buildP1681ExecutiveDecisionCenterView(): Promise<P1681ExecutiveDecisionCenterView> {
  const [approval, scheduler, ctx, cached, opsResult] = await Promise.all([
    buildP168ExecutiveApprovalReport(),
    buildP167ProductionSchedulerReport(),
    gatherP167SchedulerContext(),
    getCachedSnapshot(),
    buildP159OperationsControlCenter(),
  ]);

  const { dashboard, warnings: opsWarnings } = opsResult;
  const gates = evaluateRunNextBatchGates(ctx);
  const checklist = buildGateChecklist(ctx, gates);
  const readinessScore =
    cached.snapshot?.readinessScore ??
    cached.snapshot?.productionReadiness?.overallReadinessScore ??
    approval.recommendation.blockingFactors.some((f) => f.includes("readiness"))
      ? 60
      : scheduler.context.productionReadinessScore;

  const score = computeExecutiveDecisionScore({
    readinessScore: readinessScore ?? scheduler.context.productionReadinessScore,
    runnerHealthy: scheduler.context.runnerHealthy,
    runnerIdle: ctx.runner.currentStatus !== "running",
    dropboxThrottling: scheduler.context.dropboxThrottlingDetected,
    dropboxWithinBudget: approval.recommendation.expectedDropboxApiRequests <= 35,
    eligibleNow: scheduler.context.eligibleNow,
    queueRemaining: scheduler.context.queueRemaining,
    deferredCount: scheduler.context.deferredReconciliationCount,
    monitorBudget: scheduler.context.monitorBudget,
    processingLockHeld: approval.safety.processingLockHeld,
    duplicateProtectionActive: scheduler.context.duplicateProtectionActive,
    activeSignatureCount: scheduler.context.activeSignatureCount,
    recentSendFailures: scheduler.context.recentSendFailures,
    todayFailures: scheduler.context.todayFailures,
  });

  const runner = dashboard.runner;
  const observationMode =
    runner.systemMode === "manual_only" || !runner.continuousEnabled;

  const lastBatch = dashboard.batchHistory[0] ?? null;
  const queueReduction =
    approval.lastExecution.paperworkSent != null && lastBatch
      ? lastBatch.paperworkSent
      : approval.lastExecution.paperworkSent;

  const approveDisabledReason = resolveApproveDisabledReason({
    action: approval.recommendation.action,
    gatesPass: gates.pass,
    checklist,
    blockingFactors: approval.recommendation.blockingFactors,
  });

  return {
    sourcePhase: P168_1_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    systemStatus: {
      observationMode,
      observationModeLabel: observationMode ? "Observation / Manual" : runner.systemMode,
      runnerStatus: runner.systemMode,
      continuousMode: approval.safety.continuousModeEnabled,
      daemonActive: approval.safety.daemonActive,
      productionReadinessScore: readinessScore ?? scheduler.context.productionReadinessScore,
      decisionScore: score.decisionScore,
      decisionGrade: score.decisionGrade,
      deferredReconciliationCount: scheduler.context.deferredReconciliationCount,
      monitorBudget: scheduler.context.monitorBudget,
    },
    recommendation: {
      id: approval.recommendation.id,
      action: approval.recommendation.action,
      title: approval.recommendation.title,
      reason: approval.recommendation.reason,
      confidence: approval.recommendation.confidence,
      expectedSends: approval.recommendation.expectedSends,
      expectedQueueReduction: approval.recommendation.expectedQueueReduction,
      projectedDropboxRequests: approval.recommendation.expectedDropboxApiRequests,
      estimatedRuntimeMs: approval.recommendation.estimatedDurationMs,
      queueRemaining: scheduler.context.queueRemaining,
      projectedQueueAfterCycle: scheduler.decision.projectedQueueAfterCycle,
      schedulerRecommendation: approval.recommendation.schedulerRecommendation,
      nextRecommendedRunAt: scheduler.decision.nextRecommendedRunAt,
    },
    blocking: {
      checklist,
      nextExpectedApprovalAt: scheduler.decision.nextRecommendedRunAt,
      actionRequiredBeforeApproval: gates.pass
        ? null
        : resolveActionRequiredBeforeApproval(checklist),
      approveDisabledReason,
    },
    lastExecution: {
      at: approval.lastExecution.at ?? runner.lastCycleAt,
      paperworkSent: approval.lastExecution.paperworkSent,
      durationMs: approval.lastExecution.durationMs,
      dropboxRequests: approval.lastExecution.dropboxRequests,
      errors: approval.lastExecution.errors,
      queueReduction: queueReduction ?? null,
      result: approval.lastExecution.result,
      executiveEmail: approval.lastExecution.executiveEmail,
    },
    history: approval.history.map((h) => ({
      id: h.id,
      at: h.at,
      executive: h.executiveEmail ?? h.executiveUserId,
      recommendation: actionLabel(h.recommendation),
      result: h.result,
      paperworkSent: h.paperworkSent,
      durationMs: h.durationMs,
      errors: h.errors,
    })),
    safety: {
      continuousModeEnabled: approval.safety.continuousModeEnabled,
      daemonActive: approval.safety.daemonActive,
      manualApprovalRequired: true,
    },
    warnings: [...approval.warnings, ...opsWarnings],
  };
}
