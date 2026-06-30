import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { ApplicantBlockerDiagnosis } from "@/lib/test-cohort-auto-advance/types";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";

export function diagnoseApplicantBlockers(input: {
  row: ScoredCandidateWorkflowRow | null;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  inP97Cohort: boolean;
  alreadySent: boolean;
  applicantEmail: string;
}): ApplicantBlockerDiagnosis {
  const emailValidation = validateCohortEmail(input.applicantEmail);
  const invalidEmail = !emailValidation.valid;

  let duplicateRisk = false;
  if (input.row) {
    duplicateRisk = Boolean(
      duplicatePaperworkSendBlockReason({
        workflow: {
          candidateId: input.row.candidateId,
          paperworkStatus: input.row.paperworkStatus,
          workflowStatus: input.row.workflowStatus,
          signatureRequestId: input.row.signatureRequestId,
        } as CandidateWorkflowRecord,
        activeOnboarding: input.onboarding,
      }),
    );
  }

  const missingRecruiterAssignment =
    !input.row || isUnassignedRecruiter(input.row.assignedRecruiter);
  const missingDmAssignment = !input.row || isUnassignedRecruiter(input.row.assignedDM);

  const workflowStatusNotPaperworkNeeded =
    !input.row || input.row.workflowStatus !== "Paperwork Needed";
  const actionTypeNotSendPaperwork =
    !input.row || input.row.actionType !== "send-paperwork";

  const p84 =
    input.row != null
      ? buildPaperworkSendEligibility({
          row: input.row,
          onboarding: input.onboarding,
          jobsByPositionId: input.jobsByPositionId,
        })
      : null;
  const p84GateFailures = p84 && !p84.eligible ? p84.blockingReasons : [];

  const primaryReasons: string[] = [];
  if (input.alreadySent) primaryReasons.push("Already paperwork sent.");
  if (invalidEmail) primaryReasons.push(emailValidation.reason ?? "Invalid email.");
  if (duplicateRisk) primaryReasons.push("Duplicate paperwork protection.");
  if (!input.inP97Cohort) primaryReasons.push("Not in P97 approval-mode cohort.");
  if (missingRecruiterAssignment) primaryReasons.push("Missing recruiter assignment.");
  if (missingDmAssignment) primaryReasons.push("Missing DM assignment.");
  if (workflowStatusNotPaperworkNeeded) {
    primaryReasons.push(`workflowStatus is ${input.row?.workflowStatus ?? "missing"} (need Paperwork Needed).`);
  }
  if (actionTypeNotSendPaperwork) {
    primaryReasons.push(`actionType is ${input.row?.actionType ?? "missing"} (need send-paperwork).`);
  }
  if (p84GateFailures.length) primaryReasons.push(...p84GateFailures);

  return {
    missingRecruiterAssignment,
    missingDmAssignment,
    notInP97Cohort: !input.inP97Cohort,
    workflowStatusNotPaperworkNeeded,
    actionTypeNotSendPaperwork,
    p84GateFailures,
    duplicateRisk,
    invalidEmail,
    alreadySent: input.alreadySent,
    primaryReasons: [...new Set(primaryReasons)],
  };
}
