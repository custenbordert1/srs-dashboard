import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildHiringDecision } from "@/lib/autonomous-hiring-decision-engine/build-hiring-decision";
import { HIRING_RECOMMENDATION_LABELS } from "@/lib/autonomous-hiring-decision-engine/types";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { simulateDownstreamAfterAssignment } from "@/lib/p62-assignment-preview/simulate-downstream";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import { buildRecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/build-assignment-decision";
import type { CandidateWorkflowRecord, RecruiterRosters } from "@/lib/candidate-workflow-types";
import type { ApplicantMatchCandidate } from "@/lib/test-cohort-validation/match-test-applicant";
import type { TestCohortApplicant } from "@/lib/test-cohort-validation/types";
import type {
  ApplicantDuplicateStatus,
  ApplicantValidationResult,
} from "@/lib/test-cohort-validation/types";
import {
  validateCohortEmail,
  validateCohortPhone,
} from "@/lib/test-cohort-validation/validate-cohort-contact";

function classifyDuplicateStatus(
  row: ScoredCandidateWorkflowRow,
  onboarding: CandidateOnboardingRecord | null,
): { status: ApplicantDuplicateStatus; detail: string | null } {
  const reason = duplicatePaperworkSendBlockReason({
    workflow: {
      candidateId: row.candidateId,
      paperworkStatus: row.paperworkStatus,
      workflowStatus: row.workflowStatus,
      signatureRequestId: row.signatureRequestId,
    } as CandidateWorkflowRecord,
    activeOnboarding: onboarding,
  });

  if (!reason) return { status: "none", detail: null };
  if (reason.toLowerCase().includes("signed")) {
    return { status: "paperwork_already_sent", detail: reason };
  }
  if (reason.toLowerCase().includes("signature")) {
    return { status: "duplicate_signature", detail: reason };
  }
  return { status: "onboarding_in_flight", detail: reason };
}

function buildRecommendation(input: {
  matchStatus: ApplicantValidationResult["matchStatus"];
  contactEmailValid: boolean;
  duplicateStatus: ApplicantDuplicateStatus;
  p84Eligible: boolean;
  p100InQueue: boolean;
  blockerReason: string | null;
}): string {
  if (input.matchStatus === "unmatched") {
    return "Not found in ingestion store — verify Breezy sync and re-run ingestion.";
  }
  if (input.matchStatus === "ambiguous") {
    return "Multiple store matches — resolve duplicate identity before automation.";
  }
  if (!input.contactEmailValid) {
    return "Block send — fix invalid email before paperwork queue.";
  }
  if (input.duplicateStatus !== "none") {
    return "Exclude from send queue — duplicate or paperwork already in flight.";
  }
  if (input.p100InQueue) {
    return "Preview eligible for send queue after approvals — dry run only until executive sign-off.";
  }
  if (input.p84Eligible) {
    return "P84 eligible on current workflow — confirm P62/P83 approvals before queueing.";
  }
  if (input.blockerReason) {
    return `Hold — ${input.blockerReason}`;
  }
  return "Monitor — complete recruiter assignment and advancement prerequisites.";
}

function buildUnmatchedResult(
  applicant: TestCohortApplicant,
  match: ApplicantMatchCandidate | null,
  ambiguous: boolean,
): ApplicantValidationResult {
  const contact = {
    emailValid: validateCohortEmail(applicant.email).valid,
    emailReason: validateCohortEmail(applicant.email).reason,
    phoneValid: validateCohortPhone(applicant.phone).valid,
    phoneReason: validateCohortPhone(applicant.phone).reason,
  };

  return {
    applicantKey: applicant.key,
    applicantName: applicant.name,
    matchStatus: ambiguous ? "ambiguous" : "unmatched",
    matchSignals: match?.signals ?? [],
    matchScore: match?.score ?? 0,
    candidateId: match?.candidate.candidateId ?? null,
    breezyId: match?.candidate.candidateId ?? null,
    positionId: match?.candidate.positionId ?? null,
    duplicateStatus: "none",
    duplicateDetail: null,
    contact,
    jobStatus: null,
    recruiter: null,
    dm: null,
    workflowStatus: null,
    actionType: null,
    p62: null,
    p83: null,
    p84: null,
    p87: null,
    p99: null,
    p100DryRun: null,
    paperworkSendEligible: false,
    blockerReason: ambiguous ? "Ambiguous candidate match." : "No ingestion store match.",
    recommendation: buildRecommendation({
      matchStatus: ambiguous ? "ambiguous" : "unmatched",
      contactEmailValid: contact.emailValid,
      duplicateStatus: "none",
      p84Eligible: false,
      p100InQueue: false,
      blockerReason: null,
    }),
    cluster: applicant.cluster ?? null,
  };
}

export function buildApplicantValidationResult(input: {
  applicant: TestCohortApplicant;
  match: ApplicantMatchCandidate | null;
  ambiguous: boolean;
  row: ScoredCandidateWorkflowRow | null;
  candidate: BreezyCandidate | null;
  jobsByPositionId: Map<string, BreezyJob>;
  workflows: Record<string, CandidateWorkflowRecord>;
  rosters: RecruiterRosters;
  ownership: Map<string, { total: number; byState: Map<string, number> }>;
  onboarding: CandidateOnboardingRecord | null;
  paperworkByGrade: PaperworkByGrade;
  p100SentIds: Set<string>;
}): ApplicantValidationResult {
  const { applicant } = input;

  if (!input.match || !input.row || !input.candidate || input.ambiguous) {
    return buildUnmatchedResult(applicant, input.match, input.ambiguous);
  }

  const row = input.row;
  const candidate = input.candidate;
  const emailValidation = validateCohortEmail(applicant.email);
  const phoneValidation = validateCohortPhone(applicant.phone);
  const contact = {
    emailValid: emailValidation.valid,
    emailReason: emailValidation.reason,
    phoneValid: phoneValidation.valid,
    phoneReason: phoneValidation.reason,
  };

  const duplicate = classifyDuplicateStatus(row, input.onboarding);
  const job = input.jobsByPositionId.get(row.positionId ?? "");
  const jobStatus = job?.status ?? null;

  const p62Decision = buildRecruiterAssignmentDecision({
    candidate,
    workflow: input.workflows[row.candidateId],
    jobState: job?.state,
    rosters: input.rosters,
    ownership: input.ownership,
  });

  const assignedRecruiter =
    p62Decision.shouldAssign && p62Decision.recruiter
      ? p62Decision.recruiter
      : row.assignedRecruiter;

  const downstream = simulateDownstreamAfterAssignment({
    row,
    assignedRecruiter,
    jobsByPositionId: input.jobsByPositionId,
    onboarding: input.onboarding,
    paperworkByGrade: input.paperworkByGrade,
    assignmentApplied: p62Decision.shouldAssign || Boolean(assignedRecruiter?.trim()),
  });

  const p84Current = buildPaperworkSendEligibility({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  });

  const p87 = buildHiringDecision({
    row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
  });

  const p99Blocking: string[] = [];
  if (!downstream.p84EligibleAfterSimulation) {
    p99Blocking.push(...downstream.p84BlockingReasonsAfterSimulation);
  }
  if (!contact.emailValid) {
    p99Blocking.push(contact.emailReason ?? "Invalid email.");
  }
  if (duplicate.status !== "none") {
    p99Blocking.push(duplicate.detail ?? "Duplicate paperwork protection.");
  }
  if (input.p100SentIds.has(row.candidateId)) {
    p99Blocking.push("P100 state marks candidate as already sent.");
  }

  const alreadySent =
    duplicate.status !== "none" ||
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.paperworkStatus === "signed" ||
    input.p100SentIds.has(row.candidateId);

  const simulatedP84Eligible = downstream.p84EligibleAfterSimulation && contact.emailValid;
  const inSendQueue = simulatedP84Eligible && !alreadySent;

  let p100Status: "ready" | "blocked" | "sent" | "not_applicable" = "not_applicable";
  let p100Blocking: string | null = null;
  if (alreadySent) {
    p100Status = "sent";
    p100Blocking = duplicate.detail ?? "Paperwork already sent or in flight.";
  } else if (inSendQueue) {
    p100Status = "ready";
  } else {
    p100Status = "blocked";
    p100Blocking =
      downstream.remainingBlocker ??
      p84Current.blockingReasons[0] ??
      (!contact.emailValid ? contact.emailReason : null) ??
      "P84 gates not satisfied.";
  }

  const paperworkSendEligible = simulatedP84Eligible && !alreadySent;
  const blockerReason =
    p100Blocking ??
    downstream.remainingBlocker ??
    p84Current.blockingReasons[0] ??
    null;

  return {
    applicantKey: applicant.key,
    applicantName: applicant.name,
    matchStatus: "matched",
    matchSignals: input.match.signals,
    matchScore: input.match.score,
    candidateId: row.candidateId,
    breezyId: row.candidateId,
    positionId: row.positionId ?? null,
    duplicateStatus: duplicate.status,
    duplicateDetail: duplicate.detail,
    contact,
    jobStatus,
    recruiter: row.assignedRecruiter ?? null,
    dm: row.assignedDM ?? null,
    workflowStatus: row.workflowStatus,
    actionType: row.actionType ?? null,
    p62: {
      recommendedRecruiter: p62Decision.recruiter || assignedRecruiter || "Unassigned",
      shouldAssign: p62Decision.shouldAssign,
      confidence: p62Decision.confidence,
      reason: p62Decision.reason,
    },
    p83: {
      action: downstream.p83Action,
      shouldAdvance: downstream.p83ShouldAdvance,
      reason: downstream.remainingBlocker ?? downstream.steps.find((s) => s.status === "blocked")?.detail ?? "Simulated advancement.",
      expectedWorkflowStatus: downstream.expectedWorkflowStatus,
      expectedActionType: downstream.expectedActionType,
    },
    p84: {
      eligible: p84Current.eligible,
      blockingReasons: p84Current.blockingReasons,
      failedGateIds: p84Current.gates.filter((g) => !g.passed).map((g) => g.id),
    },
    p87: {
      recommendation: HIRING_RECOMMENDATION_LABELS[p87.action],
      action: p87.action,
      confidence: p87.confidence,
      paperworkReady: row.candidateGrade.paperworkReady,
    },
    p99: {
      ready: p99Blocking.length === 0,
      blockingReasons: p99Blocking,
    },
    p100DryRun: {
      inSendQueue,
      status: p100Status,
      blockingReason: p100Blocking,
    },
    paperworkSendEligible,
    blockerReason,
    recommendation: buildRecommendation({
      matchStatus: "matched",
      contactEmailValid: contact.emailValid,
      duplicateStatus: duplicate.status,
      p84Eligible: downstream.p84EligibleAfterSimulation,
      p100InQueue: inSendQueue,
      blockerReason,
    }),
    cluster: applicant.cluster ?? null,
  };
}
