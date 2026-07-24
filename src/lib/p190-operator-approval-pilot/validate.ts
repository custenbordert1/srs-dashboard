import { detectHolds, hasApprovalEvidence } from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import { P188_1_RECOMMENDED_STAGE } from "@/lib/p188-1-hiring-recommendation-workflow/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P190_OPERATOR_APPROVED_STATUS,
  type P190FrozenCohortMember,
} from "@/lib/p190-operator-approval-pilot/types";

export type P190ValidationGate = {
  gateId: string;
  ok: boolean;
  detail: string;
};

export type P190CandidateValidation = {
  ok: boolean;
  blockers: string[];
  gates: P190ValidationGate[];
};

function gate(gateId: string, ok: boolean, detail: string): P190ValidationGate {
  return { gateId, ok, detail };
}

/**
 * Validate a cohort member is eligible for Operator Approval — no mutations.
 */
export function validateOperatorApprovalCandidate(input: {
  member: P190FrozenCohortMember;
  workflow: CandidateWorkflowRecord | null | undefined;
  jobResolved: boolean;
}): P190CandidateValidation {
  const wf = input.workflow;
  const holds = detectHolds({ notes: wf?.notes ?? [], nextActionNeeded: wf?.nextActionNeeded });
  const alreadyApproved =
    wf?.workflowStatus === P190_OPERATOR_APPROVED_STATUS ||
    hasApprovalEvidence({
      notes: wf?.notes ?? [],
      progressionReason: wf?.progressionReason ?? null,
    });
  const paperworkExists =
    Boolean(wf) &&
    (wf!.workflowStatus === "Paperwork Needed" ||
      wf!.workflowStatus === "Paperwork Sent" ||
      (wf!.paperworkStatus != null && wf!.paperworkStatus !== "not_sent") ||
      Boolean(wf!.paperworkSentAt) ||
      Boolean(wf!.signatureRequestId));

  const gates: P190ValidationGate[] = [
    gate("workflow_exists", Boolean(wf), wf ? "workflow present" : "missing workflow"),
    gate(
      "recommend_hire_exists",
      wf?.recommendedStage === P188_1_RECOMMENDED_STAGE,
      `recommendedStage=${wf?.recommendedStage ?? "null"}`,
    ),
    gate(
      "recruiter_ownership",
      Boolean(wf?.assignedRecruiter) &&
        wf!.assignedRecruiter !== "Unassigned" &&
        wf!.assignedRecruiter === input.member.recruiter,
      `recruiter=${wf?.assignedRecruiter ?? "null"} expected=${input.member.recruiter}`,
    ),
    gate(
      "job_assignment",
      input.jobResolved && Boolean(input.member.jobId.trim()),
      `jobId=${input.member.jobId}`,
    ),
    gate("no_holds", holds.length === 0, holds.length ? holds.join(",") : "no holds"),
    gate(
      "not_already_approved",
      !alreadyApproved,
      alreadyApproved ? "already operator approved" : "not approved",
    ),
    gate(
      "no_paperwork",
      !paperworkExists,
      paperworkExists
        ? `paperworkStatus=${wf?.paperworkStatus} status=${wf?.workflowStatus}`
        : "no paperwork",
    ),
    gate(
      "no_duplicate_workflow_state",
      wf?.workflowStatus !== P190_OPERATOR_APPROVED_STATUS,
      `workflowStatus=${wf?.workflowStatus ?? "null"}`,
    ),
    gate(
      "ownership_version",
      (wf?.recruiterOwnershipVersion ?? 0) === input.member.expectedOwnershipVersion,
      `version=${wf?.recruiterOwnershipVersion ?? 0} expected=${input.member.expectedOwnershipVersion}`,
    ),
  ];

  const blockers = gates.filter((g) => !g.ok).map((g) => `${g.gateId}: ${g.detail}`);
  return { ok: blockers.length === 0, blockers, gates };
}
