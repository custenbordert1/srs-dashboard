import { detectHolds } from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import { P190_OPERATOR_APPROVED_STATUS } from "@/lib/p190-operator-approval-pilot/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  P191_PAPERWORK_NEEDED_STATUS,
  type P191FrozenCohortMember,
} from "@/lib/p191-paperwork-release-pilot/types";

export type P191ValidationGate = {
  gateId: string;
  ok: boolean;
  detail: string;
};

export type P191CandidateValidation = {
  ok: boolean;
  blockers: string[];
  gates: P191ValidationGate[];
};

function gate(gateId: string, ok: boolean, detail: string): P191ValidationGate {
  return { gateId, ok, detail };
}

/**
 * Pre-send validation for one cohort member. No mutations.
 */
export function validatePaperworkReleaseCandidate(input: {
  member: P191FrozenCohortMember;
  workflow: CandidateWorkflowRecord | null | undefined;
  jobResolved: boolean;
  p184Mode: string;
}): P191CandidateValidation {
  const wf = input.workflow;
  const holds = detectHolds({ notes: wf?.notes ?? [], nextActionNeeded: wf?.nextActionNeeded });
  const paperworkExists =
    Boolean(wf) &&
    (wf!.paperworkStatus !== "not_sent" ||
      Boolean(wf!.paperworkSentAt) ||
      wf!.workflowStatus === "Paperwork Sent" ||
      wf!.workflowStatus === P191_PAPERWORK_NEEDED_STATUS);
  const envelopeExists = Boolean(wf?.signatureRequestId?.trim());
  const duplicateState =
    wf?.workflowStatus === P191_PAPERWORK_NEEDED_STATUS ||
    wf?.workflowStatus === "Paperwork Sent";

  const gates: P191ValidationGate[] = [
    gate("workflow_exists", Boolean(wf), wf ? "workflow present" : "missing workflow"),
    gate(
      "operator_approved",
      wf?.workflowStatus === P190_OPERATOR_APPROVED_STATUS,
      `workflowStatus=${wf?.workflowStatus ?? "null"}`,
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
      "no_paperwork_exists",
      !paperworkExists,
      paperworkExists
        ? `paperworkStatus=${wf?.paperworkStatus} status=${wf?.workflowStatus}`
        : "no paperwork",
    ),
    gate(
      "no_dropbox_envelope",
      !envelopeExists,
      envelopeExists ? `signatureRequestId=${wf?.signatureRequestId}` : "no envelope",
    ),
    gate(
      "no_duplicate_workflow_state",
      !duplicateState,
      `workflowStatus=${wf?.workflowStatus ?? "null"}`,
    ),
    gate(
      "p184_dry_run",
      input.p184Mode === "dry_run",
      `p184Mode=${input.p184Mode}`,
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
