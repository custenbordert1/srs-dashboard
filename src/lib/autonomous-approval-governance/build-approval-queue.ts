import type { GovernedDecision, ApprovalQueueItem } from "@/lib/autonomous-approval-governance/types";

export function buildApprovalQueue(governed: GovernedDecision[]): ApprovalQueueItem[] {
  return governed
    .filter(
      (d) =>
        d.approvalLevel === "recruiter_approval_required" ||
        d.approvalLevel === "dm_approval_required" ||
        d.approvalLevel === "executive_approval_required",
    )
    .map((d) => ({
      decisionId: d.decisionId,
      candidateId: d.affectedCandidateIds[0] ?? null,
      candidateName: d.affectedCandidateNames[0] ?? null,
      recommendedAction: d.decision,
      requiredApprover: d.requiredApprover,
      approvalLevel: d.approvalLevel,
      confidence: d.confidence,
      risk: d.risk,
      reason: d.governanceReason,
      blockingRules: d.blockingRules,
      expectedOutcome: d.expectedOutcome,
      timeSavedMinutesIfApproved: d.estimatedRecruiterTimeSavedMinutes,
    }))
    .sort((a, b) => b.confidence - a.confidence);
}
