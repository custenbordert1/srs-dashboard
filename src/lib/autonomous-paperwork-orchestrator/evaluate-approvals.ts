import type { LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import type { PaperworkEligibilityStatus } from "@/lib/autonomous-paperwork-orchestrator/types";

const APPROVAL_READY: PaperworkEligibilityStatus[] = ["READY_TO_SEND", "READY_AFTER_APPROVAL"];

export function evaluateApprovalDecision(input: {
  context: LoadedPaperworkCandidates;
  candidateId: string;
  eligibilityStatus: PaperworkEligibilityStatus;
  approvedMappingReady: boolean;
  onPilotAllowlist: boolean;
}): {
  approvedForQueue: boolean;
  approvalRequired: boolean;
  reason: string;
} {
  if (!APPROVAL_READY.includes(input.eligibilityStatus)) {
    return {
      approvedForQueue: false,
      approvalRequired: false,
      reason: `Not approval-ready (${input.eligibilityStatus}).`,
    };
  }

  if (!input.onPilotAllowlist) {
    return {
      approvedForQueue: false,
      approvalRequired: true,
      reason: "Candidate not on pilot allowlist.",
    };
  }

  if (input.eligibilityStatus === "READY_AFTER_APPROVAL" && !input.approvedMappingReady) {
    return {
      approvedForQueue: false,
      approvalRequired: true,
      reason: "Approved mapping required before send.",
    };
  }

  const nativePublished =
    Boolean(input.context.rowsByCandidateId.get(input.candidateId)?.positionId) &&
    input.context.jobsByPositionId.has(input.context.rowsByCandidateId.get(input.candidateId)!.positionId!);

  if (!nativePublished && !input.approvedMappingReady) {
    return {
      approvedForQueue: false,
      approvalRequired: true,
      reason: "Requires approved mapping or native published project.",
    };
  }

  return {
    approvedForQueue: true,
    approvalRequired: input.eligibilityStatus === "READY_AFTER_APPROVAL",
    reason: "Approval gates satisfied for orchestrator queue.",
  };
}
