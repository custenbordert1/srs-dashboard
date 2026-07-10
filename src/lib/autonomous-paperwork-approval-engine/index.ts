export {
  P124_SOURCE_PHASE,
  type ApprovalDecision,
  type ApprovalPolicy,
  type ApprovalReport,
  type ApprovalSummary,
  type CandidateApprovalRecord,
  type CriticalSafetyFailure,
} from "@/lib/autonomous-paperwork-approval-engine/types";
export { buildApprovalPolicy, DEFAULT_APPROVAL_POLICY } from "@/lib/autonomous-paperwork-approval-engine/build-approval-policy";
export { scoreApprovalConfidence } from "@/lib/autonomous-paperwork-approval-engine/score-approval-confidence";
export {
  evaluateApprovalDecision,
  isAutoApprovedForSendQueue,
} from "@/lib/autonomous-paperwork-approval-engine/evaluate-approval-decision";
export { explainApprovalDecision } from "@/lib/autonomous-paperwork-approval-engine/explain-approval-decision";
export {
  buildApprovalDecisionsFromContext,
  buildApprovalReport,
  buildApprovalSummary,
} from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
