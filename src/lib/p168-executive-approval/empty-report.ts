import { P168_SOURCE_PHASE } from "@/lib/p168-executive-approval/approval-types";
import type { P168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/approval-types";

const now = () => new Date().toISOString();

export function emptyP168ExecutiveApprovalReport(): P168ExecutiveApprovalReport {
  return {
    sourcePhase: P168_SOURCE_PHASE,
    generatedAt: now(),
    readOnly: true,
    recommendation: {
      id: "p168-empty",
      action: "WAIT",
      title: "Wait before next batch",
      reason: "Degraded empty approval report — scheduler timed out.",
      confidence: 0,
      expectedSends: 0,
      expectedDropboxApiRequests: 0,
      expectedQueueReduction: 0,
      estimatedDurationMs: null,
      blockingFactors: ["Scheduler unavailable"],
      riskLevel: "high",
      requiredApprovals: [],
      schedulerRecommendation: "WAIT_10_MINUTES",
      generatedAt: now(),
    },
    lastExecution: {
      at: null,
      executiveEmail: null,
      paperworkSent: null,
      durationMs: null,
      dropboxRequests: null,
      errors: null,
      result: null,
    },
    history: [],
    safety: {
      continuousModeEnabled: false,
      daemonActive: false,
      processingLockHeld: false,
      liveCycleEnvEnabled: false,
      manualOperatorApprovalRequired: true,
    },
    warnings: ["Degraded empty executive approval report"],
  };
}
