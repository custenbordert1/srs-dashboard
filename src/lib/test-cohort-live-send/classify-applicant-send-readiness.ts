import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { detectPositionTitleEncodingIssue } from "@/lib/test-cohort-validation/normalize-position-title";
import type { TestCohortApplicant } from "@/lib/test-cohort-validation/types";
import type { ApplicantValidationResult } from "@/lib/test-cohort-validation/types";
import { validateCohortEmail } from "@/lib/test-cohort-validation/validate-cohort-contact";
import type { ApplicantSendCategory, ApplicantSendReadiness } from "@/lib/test-cohort-live-send/types";

function isAlreadyPaperworkSent(row: ScoredCandidateWorkflowRow | null): boolean {
  if (!row) return false;
  return (
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.paperworkStatus === "signed" ||
    row.workflowStatus === "Paperwork Sent" ||
    row.workflowStatus === "Signed" ||
    Boolean(row.signatureRequestId?.trim())
  );
}

function buildRecommendation(input: {
  category: ApplicantSendCategory;
  blockerReasons: string[];
}): string {
  if (input.category === "safe_to_send_now") {
    return "Send now via controlled executeOne after dryRun approval.";
  }
  if (input.category === "already_sent") {
    return "No action — paperwork already sent or in flight.";
  }
  if (input.category === "invalid_email") {
    return "Block send — correct email before queueing paperwork.";
  }
  if (input.category === "duplicate_risk") {
    return "Exclude from send queue — resolve duplicate protection first.";
  }
  return `Hold — ${input.blockerReasons[0] ?? "prerequisites not met"}.`;
}

export function classifyApplicantSendReadiness(input: {
  applicant: TestCohortApplicant;
  validation: ApplicantValidationResult;
  row: ScoredCandidateWorkflowRow | null;
  storePositionTitle: string | null;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  p97PersistedIds: Set<string>;
  p100SentIds: Set<string>;
}): ApplicantSendReadiness {
  const emailValidation = validateCohortEmail(input.applicant.email);
  const encoding = detectPositionTitleEncodingIssue(
    input.applicant.positionTitle,
    input.storePositionTitle ?? undefined,
  );

  const blockerReasons: string[] = [];
  const candidateId = input.validation.candidateId;
  const inP97Cohort = candidateId ? input.p97PersistedIds.has(candidateId) : false;
  const alreadyPaperworkSent =
    isAlreadyPaperworkSent(input.row) ||
    (candidateId ? input.p100SentIds.has(candidateId) : false);

  let duplicateRisk = false;
  if (input.row) {
    const dupReason = duplicatePaperworkSendBlockReason({
      workflow: {
        candidateId: input.row.candidateId,
        paperworkStatus: input.row.paperworkStatus,
        workflowStatus: input.row.workflowStatus,
        signatureRequestId: input.row.signatureRequestId,
      } as CandidateWorkflowRecord,
      activeOnboarding: input.onboarding,
    });
    duplicateRisk = Boolean(dupReason);
    if (dupReason) blockerReasons.push(dupReason);
  }

  const p84 =
    input.row != null
      ? buildPaperworkSendEligibility({
          row: input.row,
          onboarding: input.onboarding,
          jobsByPositionId: input.jobsByPositionId,
        })
      : null;
  const p84EligibleNow = p84?.eligible ?? false;
  if (p84 && !p84.eligible) {
    blockerReasons.push(...p84.blockingReasons);
  }

  if (!emailValidation.valid) {
    blockerReasons.unshift(emailValidation.reason ?? "Invalid email.");
  }
  if (input.validation.matchStatus !== "matched") {
    blockerReasons.push(
      input.validation.matchStatus === "ambiguous"
        ? "Ambiguous candidate match."
        : "No ingestion store match.",
    );
  }
  if (!inP97Cohort && candidateId) {
    blockerReasons.push("Not in P97 approval-mode cohort — controlled live-send unavailable.");
  }
  if (encoding.hasEncodingMismatch && encoding.detail) {
    blockerReasons.push(encoding.detail);
  }

  const invalidEmail = !emailValidation.valid;
  const p100Ready = p84EligibleNow && inP97Cohort && !alreadyPaperworkSent && !duplicateRisk && !invalidEmail;

  let category: ApplicantSendCategory = "blocked";
  if (alreadyPaperworkSent) {
    category = "already_sent";
  } else if (invalidEmail) {
    category = "invalid_email";
  } else if (duplicateRisk) {
    category = "duplicate_risk";
  } else if (p100Ready) {
    category = "safe_to_send_now";
  } else {
    category = "blocked";
  }

  const uniqueBlockers = [...new Set(blockerReasons.filter(Boolean))];

  return {
    applicantKey: input.applicant.key,
    applicantName: input.applicant.name,
    candidateId,
    email: input.applicant.email,
    category,
    safeToSendNow: category === "safe_to_send_now",
    inP97Cohort,
    p84EligibleNow,
    p100Ready,
    alreadyPaperworkSent,
    duplicateRisk,
    invalidEmail,
    positionTitleEncoding: {
      flagged: encoding.hasEncodingMismatch,
      detail: encoding.detail,
    },
    blockerReasons: uniqueBlockers,
    recommendation: buildRecommendation({ category, blockerReasons: uniqueBlockers }),
  };
}
