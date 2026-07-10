import {
  evaluateApprovalDecision,
  isAutoApprovedForSendQueue,
} from "@/lib/autonomous-paperwork-approval-engine/evaluate-approval-decision";
import { buildApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/build-approval-policy";
import { daysSince } from "@/lib/autonomous-paperwork-orchestrator/evaluate-eligibility";
import type { LoadedPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import type { PaperworkEligibilityStatus } from "@/lib/autonomous-paperwork-orchestrator/types";
import type { CandidateApprovalRecord } from "@/lib/autonomous-paperwork-approval-engine/types";

export function evaluateOrchestratorApproval(input: {
  context: LoadedPaperworkCandidates;
  candidateId: string;
  candidateName: string;
  eligibilityStatus: PaperworkEligibilityStatus;
  templateKey: string | null;
  mappingConfidence: number;
  approvedMappingReady: boolean;
  onPilotAllowlist: boolean;
  row: import("@/lib/build-candidate-workflow-row").ScoredCandidateWorkflowRow | null;
}): {
  approval: CandidateApprovalRecord;
  approvedForQueue: boolean;
  approvalRequired: boolean;
  reason: string;
} {
  const row = input.row;
  const approvedMapping = input.context.approvedMappingsByCandidate.get(input.candidateId) ?? null;
  const p109Record = input.context.p109ByCandidate.get(input.candidateId) ?? null;
  const nativePublishedJob = Boolean(row?.positionId && input.context.jobsByPositionId.has(row.positionId));
  const alreadySent =
    input.eligibilityStatus === "ALREADY_SENT" ||
    input.context.p100SentIds.has(input.candidateId) ||
    input.context.pilotSentIds.has(input.candidateId);
  const duplicateRisk = input.eligibilityStatus === "DUPLICATE";

  const approval = evaluateApprovalDecision({
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    row,
    eligibilityStatus: input.eligibilityStatus,
    templateKey: input.templateKey,
    mappingConfidence: input.mappingConfidence,
    approvedMapping,
    p109Record,
    nativePublishedJob,
    alreadySent,
    duplicateRisk,
    candidateAgeDays: daysSince(row?.createdDate ?? null),
    policy: buildApprovalPolicy(),
  });

  const autoApproved = isAutoApprovedForSendQueue(approval.approvalDecision);
  const approvedForQueue = autoApproved && input.onPilotAllowlist;

  return {
    approval,
    approvedForQueue,
    approvalRequired: approval.approvalDecision === "NEEDS_HUMAN_APPROVAL",
    reason: approval.recommendedNextAction,
  };
}

export { evaluateOrchestratorApproval as evaluateApprovalDecision };
