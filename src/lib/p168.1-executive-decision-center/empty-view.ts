import { P168_1_SOURCE_PHASE } from "@/lib/p168.1-executive-decision-center/types";
import type { P1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/types";

const now = () => new Date().toISOString();

export function emptyP1681DecisionCenterView(): P1681ExecutiveDecisionCenterView {
  return {
    sourcePhase: P168_1_SOURCE_PHASE,
    generatedAt: now(),
    systemStatus: {
      observationMode: true,
      observationModeLabel: "Unavailable",
      runnerStatus: "unknown",
      continuousMode: false,
      daemonActive: false,
      productionReadinessScore: null,
      decisionScore: 0,
      decisionGrade: "Intervention Required",
      deferredReconciliationCount: 0,
      monitorBudget: 25,
    },
    recommendation: {
      id: "p168-empty",
      action: "WAIT",
      title: "Wait before next batch",
      reason: "Degraded — decision center timed out.",
      confidence: 0,
      expectedSends: 0,
      expectedQueueReduction: 0,
      projectedDropboxRequests: 0,
      estimatedRuntimeMs: null,
      queueRemaining: 0,
      projectedQueueAfterCycle: 0,
      schedulerRecommendation: "WAIT_10_MINUTES",
      nextRecommendedRunAt: null,
    },
    blocking: {
      checklist: [],
      nextExpectedApprovalAt: null,
      actionRequiredBeforeApproval: "Refresh decision center",
      approveDisabledReason: "Decision center unavailable",
    },
    lastExecution: {
      at: null,
      paperworkSent: null,
      durationMs: null,
      dropboxRequests: null,
      errors: null,
      queueReduction: null,
      result: null,
      executiveEmail: null,
    },
    history: [],
    safety: {
      continuousModeEnabled: false,
      daemonActive: false,
      manualApprovalRequired: true,
    },
    warnings: ["Degraded empty decision center view"],
  };
}
