import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { suggestDmForCandidate } from "@/lib/candidate-dm-suggest";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildP84SendQueueEntry } from "@/lib/p84-send-queue-preview/build-p84-send-queue-preview";
import { DEFAULT_P84_FEATURE_FLAGS } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildRecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import type { P62P83ApprovalQueueEntry } from "@/lib/p62-p83-approval-preview/types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";
import type { TestCohortApplicant } from "@/lib/test-cohort-validation/types";
import { P105_ALREADY_SENT_CANDIDATE_IDS } from "@/lib/test-cohort-auto-advance/types";

export function isP105PersistenceCandidate(input: {
  applicant: TestCohortApplicant;
  candidateId: string | null;
}): { allowed: boolean; reason: string | null } {
  if (!input.candidateId) {
    return { allowed: false, reason: "No matched candidate ID." };
  }
  if ((P105_ALREADY_SENT_CANDIDATE_IDS as readonly string[]).includes(input.candidateId)) {
    return { allowed: false, reason: "Already sent — skip persistence." };
  }
  if (input.applicant.key === "john-sykes") {
    return { allowed: false, reason: "John Sykes already sent in P104." };
  }
  const email = validateCohortEmail(input.applicant.email);
  if (!email.valid) {
    return { allowed: false, reason: email.reason ?? "Invalid email." };
  }
  return { allowed: true, reason: null };
}

export function buildTestCohortApprovalEntry(input: {
  applicant: TestCohortApplicant;
  candidate: BreezyCandidate;
  row: ScoredCandidateWorkflowRow;
  workflow: CandidateWorkflowRecord | undefined;
  job: BreezyJob | undefined;
  rosters: RecruiterRosters;
  ownership: Map<string, { total: number; byState: Map<string, number> }>;
}): P62P83ApprovalQueueEntry {
  const p62 = buildRecruiterAssignmentDecision({
    candidate: input.candidate,
    workflow: input.workflow,
    jobState: input.job?.state,
    rosters: input.rosters,
    ownership: input.ownership,
  });

  const assignedRecruiter =
    p62.shouldAssign && p62.recruiter ? p62.recruiter : input.row.assignedRecruiter;
  const suggestedDm =
    !isUnassignedRecruiter(input.row.suggestedDM)
      ? input.row.suggestedDM
      : suggestDmForCandidate({
          candidateState: input.candidate.state,
          jobState: input.job?.state,
        });

  return {
    candidateId: input.candidate.candidateId,
    candidateName: input.applicant.name,
    positionId: input.candidate.positionId,
    jobTitle: input.candidate.positionName ?? input.applicant.positionTitle,
    city: input.candidate.city ?? input.applicant.city,
    state: input.candidate.state ?? input.applicant.state,
    dmTerritory: input.job?.state ?? input.applicant.state,
    suggestedDm,
    assignedRecruiter: isUnassignedRecruiter(assignedRecruiter) ? "Taylor" : assignedRecruiter,
    confidence: p62.confidence,
    approvalStatus: "pending",
    riskLevel: p62.shouldAssign ? "low" : "medium",
    safeToApprove: true,
    assignmentReason: p62.reason,
    postApprovalSimulation: {
      approvalSimulated: true,
      workflowStatus: "Paperwork Needed",
      actionType: "send-paperwork",
      recruiterAssigned: assignedRecruiter,
      dmAssigned: suggestedDm,
      p84Eligible: true,
      liveSend: false,
      p83Action: "send-paperwork",
      simulationDetail: "P105 test cohort auto-advance persistence.",
    },
    manualApprovalRequired: true,
    autoApproveBlocked: true,
  };
}

export function buildTestCohortSendEntry(input: {
  approval: P62P83ApprovalQueueEntry;
  row: ScoredCandidateWorkflowRow;
  jobsByPositionId: Map<string, BreezyJob>;
  onboarding: CandidateOnboardingRecord | null;
}) {
  return buildP84SendQueueEntry({
    approval: input.approval,
    row: input.row,
    jobsByPositionId: input.jobsByPositionId,
    onboarding: input.onboarding,
    p84Flags: { ...DEFAULT_P84_FEATURE_FLAGS, liveSend: false },
  });
}
