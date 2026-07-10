import type { AutonomousPaperworkOperationsCenterReport } from "@/lib/p118-autonomous-paperwork-operations-center/types";
import type { AutonomousRecoveryReport } from "@/lib/p119-autonomous-recovery-engine/types";
import type {
  AutomationLiveStatus,
  EnrichedTopAction,
  ExecutiveCommandSummaryMetrics,
  ExecutiveGoStatus,
  SendsEnabledStatus,
} from "@/lib/p120-executive-ui-cleanup/types";

export function resolveAutomationLiveStatus(
  operations: AutonomousPaperworkOperationsCenterReport,
): AutomationLiveStatus {
  return operations.healthSummary.currentMode === "live" ? "LIVE" : "NOT LIVE";
}

export function resolveSendsEnabledStatus(
  operations: AutonomousPaperworkOperationsCenterReport,
): SendsEnabledStatus {
  const liveSendGate = operations.safetyStatus.find((gate) => gate.id === "live_mode_disabled");
  const sendsDisabled = liveSendGate?.passed ?? true;
  const runnerLive = operations.healthSummary.currentMode === "live";
  return runnerLive && !sendsDisabled ? "SENDS ENABLED" : "SENDS DISABLED";
}

export function resolveExecutiveGoStatus(input: {
  operations: AutonomousPaperworkOperationsCenterReport;
  recovery: AutonomousRecoveryReport;
}): ExecutiveGoStatus {
  if (input.operations.healthSummary.currentMode === "live") {
    const operatorGate = input.operations.safetyStatus.find((gate) => gate.id === "operator_checklist");
    return operatorGate?.passed ? "GO WITH CONDITIONS" : "NO-GO";
  }
  if (input.operations.goNoGo === "GO" && input.recovery.goNoGo === "GO") {
    return "GO";
  }
  if (input.operations.goNoGo === "GO" || input.recovery.goNoGo === "GO") {
    return "GO WITH CONDITIONS";
  }
  return "NO-GO";
}

export function resolveRecommendedOwner(actionType: string): string {
  switch (actionType) {
    case "Approve Mapping":
      return "Taylor (mapping reviewer)";
    case "Publish Job":
      return "Recruiting operations";
    case "Auto Repair":
      return "System (dry-run preview)";
    case "Fix Email":
      return "Assigned recruiter";
    case "Contact Candidate":
      return "Assigned recruiter";
    case "Wait for Signature":
      return "Candidate / monitor";
    case "Escalate":
      return "Executive reviewer";
    case "Reject Mapping":
      return "Taylor (mapping reviewer)";
    default:
      return "Recruiter team";
  }
}

export function resolveActionSafetyStatus(action: {
  actionType: string;
  businessImpact: string;
}): { safetyStatus: string; humanApprovalRequired: boolean } {
  switch (action.actionType) {
    case "Auto Repair":
      return {
        safetyStatus: "Dry-run only — no automatic execution",
        humanApprovalRequired: true,
      };
    case "Approve Mapping":
      return {
        safetyStatus:
          action.businessImpact === "high" ? "Review bulk safety before approval" : "Individual review recommended",
        humanApprovalRequired: true,
      };
    case "Publish Job":
      return {
        safetyStatus: "Human approval required before Breezy publish",
        humanApprovalRequired: true,
      };
    case "Fix Email":
    case "Contact Candidate":
      return {
        safetyStatus: "Recruiter action — no automated send",
        humanApprovalRequired: true,
      };
    case "Wait for Signature":
      return {
        safetyStatus: "Monitor only — no send action",
        humanApprovalRequired: false,
      };
    case "Escalate":
      return {
        safetyStatus: "Protection gate active — executive review",
        humanApprovalRequired: true,
      };
    default:
      return {
        safetyStatus: "No automated action",
        humanApprovalRequired: false,
      };
  }
}

export function enrichTopActions(
  actions: AutonomousRecoveryReport["actionQueue"],
  limit = 5,
): EnrichedTopAction[] {
  return actions.slice(0, limit).map((action) => {
    const safety = resolveActionSafetyStatus(action);
    return {
      ...action,
      title: action.actionType,
      recommendedOwner: resolveRecommendedOwner(action.actionType),
      safetyStatus: safety.safetyStatus,
      humanApprovalRequired: safety.humanApprovalRequired,
    };
  });
}

export function buildExecutiveCommandSummaryMetrics(input: {
  operations: AutonomousPaperworkOperationsCenterReport;
  recovery: AutonomousRecoveryReport;
}): ExecutiveCommandSummaryMetrics {
  const goStatus = resolveExecutiveGoStatus(input);
  const topAction = input.recovery.actionQueue[0];

  return {
    automationLive: resolveAutomationLiveStatus(input.operations),
    paperworkSendingAutomatically: resolveSendsEnabledStatus(input.operations),
    goStatus,
    totalBlockedCandidates: input.operations.healthSummary.blockedCount,
    estimatedRecoverableCandidates: input.recovery.executiveSummary.estimatedPaperworkUnlocked,
    approvedMappingsReady: input.operations.queueDepth.approvedMappingReady,
    pendingMappingReviews: input.operations.queueDepth.pendingMappingReview,
    topRecommendedAction: topAction
      ? `${topAction.actionType} — unlock ${topAction.expectedUnlockCount}`
      : "No prioritized actions",
    humanApprovalRequired: goStatus !== "GO" || topAction?.actionType !== "Wait for Signature",
  };
}
