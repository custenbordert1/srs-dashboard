import {
  P188_1_RECOMMENDED_STAGE,
  type P1881AllowedRole,
  type P1881CandidateContext,
  type P1881ValidationGate,
  type P1881ValidationResult,
} from "@/lib/p188-1-hiring-recommendation-workflow/types";

const ALLOWED_ROLES = new Set<P1881AllowedRole>([
  "recruiter",
  "dm",
  "operator",
  "executive",
]);

const ELIGIBLE_STATUSES = new Set(["Applied", "Needs Review", "Qualified"]);

function gate(gateId: string, ok: boolean, detail: string): P1881ValidationGate {
  return { gateId, ok, detail };
}

/**
 * Validate Recommend Hire eligibility — no mutations.
 */
export function validateRecommendHire(input: {
  actor: string;
  role: string;
  reason: string;
  context: P1881CandidateContext;
}): P1881ValidationResult {
  const ctx = input.context;
  const gates: P1881ValidationGate[] = [
    gate(
      "authenticated_role",
      ALLOWED_ROLES.has(input.role as P1881AllowedRole) && Boolean(input.actor.trim()),
      `role=${input.role} actor=${input.actor || "missing"}`,
    ),
    gate(
      "identity_resolved",
      ctx.identityResolved && Boolean(ctx.candidateId.trim()),
      `identityResolved=${ctx.identityResolved}`,
    ),
    gate(
      "workflow_exists",
      ctx.workflowExists,
      ctx.workflowExists ? "workflow present" : "workflow record missing",
    ),
    gate(
      "status_applied_or_review",
      Boolean(ctx.workflowStatus && ELIGIBLE_STATUSES.has(ctx.workflowStatus)),
      `workflowStatus=${ctx.workflowStatus ?? "null"}`,
    ),
    gate(
      "recruiter_review_completed",
      ctx.reviewCompleted ||
        ctx.workflowStatus === "Needs Review" ||
        ctx.workflowStatus === "Qualified",
      `reviewCompleted=${ctx.reviewCompleted}`,
    ),
    gate(
      "recruiter_resolved",
      ctx.recruiterResolved &&
        Boolean(ctx.recruiterId?.trim()) &&
        ctx.recruiterId !== "Unassigned",
      `recruiter=${ctx.recruiterId ?? "null"}`,
    ),
    gate(
      "job_resolved",
      ctx.jobResolved && Boolean(ctx.jobId?.trim()),
      `job=${ctx.jobId ?? "null"}`,
    ),
    gate(
      "recommendation_reason",
      Boolean(input.reason.trim()) && input.reason.trim().length >= 8,
      input.reason.trim() ? "reason present" : "reason required (≥8 chars)",
    ),
    gate("not_withdrawn", !ctx.withdrawn, `withdrawn=${ctx.withdrawn}`),
    gate("not_archived", !ctx.archived, `archived=${ctx.archived}`),
    gate(
      "no_active_hold",
      ctx.holdFlags.length === 0,
      ctx.holdFlags.length ? `holds=${ctx.holdFlags.join(",")}` : "no holds",
    ),
    gate(
      "no_prior_recommendation",
      !ctx.hasPriorRecommendation,
      ctx.hasPriorRecommendation
        ? `recommendedStage=${ctx.recommendedStage}`
        : "no prior recommendation",
    ),
    gate(
      "no_prior_operator_approval",
      !ctx.hasPriorOperatorApproval,
      `priorApproval=${ctx.hasPriorOperatorApproval}`,
    ),
    gate(
      "no_active_paperwork",
      !ctx.paperworkActive,
      `paperworkStatus=${ctx.paperworkStatus ?? "not_sent"}`,
    ),
    gate(
      "no_conflicting_operation",
      !ctx.conflictingOperation,
      `conflicting=${ctx.conflictingOperation}`,
    ),
    gate(
      "fresh_record_version",
      !ctx.stale &&
        (!ctx.expectedProductionRecordVersion ||
          ctx.expectedProductionRecordVersion === ctx.productionRecordVersion),
      ctx.stale
        ? "stale production state"
        : `version=${ctx.productionRecordVersion}`,
    ),
  ];

  const blockers = gates.filter((g) => !g.ok).map((g) => `${g.gateId}: ${g.detail}`);
  const ok = blockers.length === 0;

  return {
    ok,
    eligible: ok,
    blockers,
    gates,
    expectedResultingState: P188_1_RECOMMENDED_STAGE,
    paperworkWillBeSent: false,
    operatorApprovalWillOccur: false,
  };
}

export function buildRecommendHirePreview(input: {
  context: P1881CandidateContext;
  validation: P1881ValidationResult;
  reason: string;
}): {
  candidateId: string;
  currentState: string | null;
  recruiter: string | null;
  job: string | null;
  recommendationReason: string;
  blockers: string[];
  expectedResultingState: string;
  confirmationNoPaperwork: true;
} {
  return {
    candidateId: input.context.candidateId,
    currentState: input.context.workflowStatus,
    recruiter: input.context.recruiterId,
    job: input.context.jobLabel ?? input.context.jobId,
    recommendationReason: input.reason,
    blockers: input.validation.blockers,
    expectedResultingState: input.validation.expectedResultingState,
    confirmationNoPaperwork: true,
  };
}
