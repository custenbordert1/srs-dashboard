import type {
  ApprovalDecision,
  ApprovalPolicy,
  CandidateApprovalRecord,
  CriticalSafetyFailure,
} from "@/lib/autonomous-paperwork-approval-engine/types";
import { scoreApprovalConfidence } from "@/lib/autonomous-paperwork-approval-engine/score-approval-confidence";
import { explainApprovalDecision } from "@/lib/autonomous-paperwork-approval-engine/explain-approval-decision";
import { buildApprovalPolicy } from "@/lib/autonomous-paperwork-approval-engine/build-approval-policy";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";
import type { PaperworkEligibilityStatus } from "@/lib/autonomous-paperwork-orchestrator/types";

function detectCriticalFailures(input: {
  row: ScoredCandidateWorkflowRow | null;
  eligibilityStatus: PaperworkEligibilityStatus;
  templateKey: string | null;
  duplicateRisk: boolean;
  alreadySent: boolean;
  p109Record: P109ReviewDecisionRecord | null;
}): CriticalSafetyFailure[] {
  const failures: CriticalSafetyFailure[] = [];
  const email = input.row?.email?.trim() ?? "";

  if (!email) failures.push("missing_candidate_email");
  if (input.eligibilityStatus === "INVALID_EMAIL") failures.push("invalid_email");
  if (input.eligibilityStatus === "DUPLICATE" || input.duplicateRisk) failures.push("duplicate_risk");
  if (input.eligibilityStatus === "ALREADY_SENT" || input.alreadySent) failures.push("already_sent");
  if (!input.templateKey || input.eligibilityStatus === "NO_TEMPLATE") failures.push("missing_template");
  if (input.p109Record?.decision === "rejected") failures.push("rejected_mapping");
  if (input.row?.workflowStatus === "Not Qualified") failures.push("manual_rejection");

  return failures;
}

function resolveDecisionFromScore(
  score: number,
  policy: ApprovalPolicy,
  hasCritical: boolean,
): ApprovalDecision {
  if (hasCritical) return "REJECTED_FOR_SAFETY";
  if (score >= policy.autoApproveThreshold) return "AUTO_APPROVED";
  if (score >= policy.humanApprovalThreshold) return "NEEDS_HUMAN_APPROVAL";
  if (score >= policy.waitingThreshold) return "WAITING";
  return "BLOCKED";
}

export function evaluateApprovalDecision(input: {
  candidateId: string;
  candidateName: string;
  row: ScoredCandidateWorkflowRow | null;
  eligibilityStatus: PaperworkEligibilityStatus;
  templateKey: string | null;
  mappingConfidence: number;
  approvedMapping: ApprovedMappingResolution | null;
  p109Record: P109ReviewDecisionRecord | null;
  nativePublishedJob: boolean;
  alreadySent: boolean;
  duplicateRisk: boolean;
  candidateAgeDays: number;
  policy?: ApprovalPolicy;
}): CandidateApprovalRecord {
  const policy = input.policy ?? buildApprovalPolicy();
  const scoring = scoreApprovalConfidence({
    row: input.row,
    templateKey: input.templateKey,
    mappingConfidence: input.mappingConfidence,
    approvedMapping: input.approvedMapping,
    p109Record: input.p109Record,
    nativePublishedJob: input.nativePublishedJob,
    alreadySent: input.alreadySent,
    duplicateRisk: input.duplicateRisk,
    candidateAgeDays: input.candidateAgeDays,
    policy,
  });

  const criticalFailures = detectCriticalFailures({
    row: input.row,
    eligibilityStatus: input.eligibilityStatus,
    templateKey: input.templateKey,
    duplicateRisk: input.duplicateRisk,
    alreadySent: input.alreadySent,
    p109Record: input.p109Record,
  });

  let approvalDecision = resolveDecisionFromScore(
    scoring.score,
    policy,
    criticalFailures.length > 0,
  );

  const humanReviewReasons: string[] = [];
  const blockingReasons: string[] = [];

  if (policy.requirePublishedJob && !input.nativePublishedJob && !input.approvedMapping?.qualifies) {
    if (approvalDecision === "AUTO_APPROVED") approvalDecision = "NEEDS_HUMAN_APPROVAL";
    humanReviewReasons.push("Requires published job or approved mapping");
  }

  if (
    policy.requireApprovedMappingOrNativeProject &&
    !input.nativePublishedJob &&
    !input.approvedMapping?.qualifies
  ) {
    blockingReasons.push("Missing approved mapping or native active project");
    if (approvalDecision === "AUTO_APPROVED" || approvalDecision === "NEEDS_HUMAN_APPROVAL") {
      approvalDecision = "BLOCKED";
    }
  }

  if (input.mappingConfidence < 80 && approvalDecision === "AUTO_APPROVED") {
    approvalDecision = "NEEDS_HUMAN_APPROVAL";
    humanReviewReasons.push("Mapping confidence below auto threshold");
  }

  if (input.eligibilityStatus === "READY_AFTER_APPROVAL" && approvalDecision === "AUTO_APPROVED") {
    humanReviewReasons.push("Closed-ad recovery requires human sign-off");
    approvalDecision = "NEEDS_HUMAN_APPROVAL";
  }

  if (approvalDecision === "NEEDS_HUMAN_APPROVAL") {
    humanReviewReasons.push("Candidate is recoverable but not safe for autonomous send");
  }

  if (approvalDecision === "BLOCKED") {
    blockingReasons.push(`Score ${scoring.score} below waiting threshold`);
  }

  if (approvalDecision === "WAITING") {
    blockingReasons.push("Waiting for prerequisites before approval review");
  }

  const recommendedNextAction =
    approvalDecision === "AUTO_APPROVED"
      ? "Eligible for autonomous send queue when P122/P123 gates pass."
      : approvalDecision === "NEEDS_HUMAN_APPROVAL"
        ? "Route to human approval queue."
        : approvalDecision === "WAITING"
          ? "Monitor until prerequisites complete."
          : approvalDecision === "REJECTED_FOR_SAFETY"
            ? "Do not send — resolve safety failure first."
            : "Resolve blockers before re-evaluation.";

  const explanation = explainApprovalDecision({
    decision: approvalDecision,
    score: scoring.score,
    approvalReasons: scoring.approvalReasons,
    safetyReasons: [...scoring.safetyReasons, ...criticalFailures.map((f) => f.replace(/_/g, " "))],
    humanReviewReasons,
    blockingReasons,
  });

  return {
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    email: input.row?.email?.trim() ?? "",
    approvalDecision,
    approvalScore: scoring.score,
    approvalReasons: scoring.approvalReasons,
    safetyReasons: [...scoring.safetyReasons, ...criticalFailures.map((f) => f.replace(/_/g, " "))],
    humanReviewReasons,
    blockingReasons,
    recommendedNextAction,
    explanation,
  };
}

export function isAutoApprovedForSendQueue(decision: ApprovalDecision): boolean {
  return decision === "AUTO_APPROVED";
}
