import {
  buildCandidateContextFromWorkflow,
  buildRecommendHirePreview,
  validateRecommendHire,
} from "@/lib/p188-1-hiring-recommendation-workflow";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { P189CandidateEnrichment } from "@/lib/p189-recommend-hire-pilot/freeze";
import {
  P189_REASON,
  type P189FrozenCohort,
  type P189PreviewRow,
} from "@/lib/p189-recommend-hire-pilot/types";

/**
 * Build operator preview for frozen cohort before any writes.
 */
export function buildP189RecommendHirePreview(input: {
  cohort: P189FrozenCohort;
  workflowsById: Map<string, CandidateWorkflowRecord>;
  enrichments: Record<string, P189CandidateEnrichment>;
}): {
  cohortId: string;
  fingerprint: string;
  confirmationRequired: true;
  rows: P189PreviewRow[];
  eligibleCount: number;
  blockedCount: number;
  paperworkWillBeSent: false;
  operatorApprovalWillOccur: false;
} {
  const rows: P189PreviewRow[] = [];

  for (const member of input.cohort.members) {
    const wf = input.workflowsById.get(member.candidateId);
    const enr = input.enrichments[member.candidateId];
    if (!wf || !enr?.jobId) {
      rows.push({
        candidateId: member.candidateId,
        recruiter: member.recruiter,
        job: member.jobLabel ?? member.jobId,
        cityState: [member.city, member.state].filter(Boolean).join(", ") || "—",
        currentStage: member.currentStage,
        expectedNewStage: "Hiring Recommendation",
        recommendationReason: P189_REASON,
        blockers: ["missing_workflow_or_job"],
        auditPreview: "would not write — missing context",
        eligible: false,
      });
      continue;
    }

    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, {
      jobId: enr.jobId,
      jobLabel: enr.jobLabel,
      jobResolved: true,
      identityResolved: enr.identityResolved,
    });
    ctx.expectedProductionRecordVersion = ctx.productionRecordVersion;

    const validation = validateRecommendHire({
      actor: "p189-operator",
      role: "operator",
      reason: P189_REASON,
      context: ctx,
    });
    const preview = buildRecommendHirePreview({
      context: ctx,
      validation,
      reason: P189_REASON,
    });

    rows.push({
      candidateId: member.candidateId,
      recruiter: preview.recruiter ?? member.recruiter,
      job: preview.job ?? member.jobId,
      cityState: [member.city, member.state].filter(Boolean).join(", ") || "—",
      currentStage: preview.currentState ?? member.currentStage,
      expectedNewStage: "Hiring Recommendation",
      recommendationReason: P189_REASON,
      blockers: preview.blockers,
      auditPreview: validation.eligible
        ? `recommend_hire actor=p189-operator → ${preview.expectedResultingState}; no OA/paperwork`
        : `recommend_hire_blocked: ${preview.blockers.join("; ")}`,
      eligible: validation.eligible,
    });
  }

  return {
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    confirmationRequired: true,
    rows,
    eligibleCount: rows.filter((r) => r.eligible).length,
    blockedCount: rows.filter((r) => !r.eligible).length,
    paperworkWillBeSent: false,
    operatorApprovalWillOccur: false,
  };
}
