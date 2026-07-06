import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-sync";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import {
  findNearestActiveOperationalNeed,
  hasOperationalFit,
  resolveOriginalJobStatus,
} from "@/lib/candidate-first-paperwork-eligibility/match-active-operational-need";
import type {
  CandidateFirstCountCategory,
  CandidateFirstPaperworkRow,
  CandidateFirstRecommendedAction,
} from "@/lib/candidate-first-paperwork-eligibility/types";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";

export const CANDIDATE_FIRST_CONFIDENCE_MIN = 80;
export const CANDIDATE_FIRST_OPERATIONAL_FIT_MIN = 55;

const ARCHIVED_HINTS = ["archived", "withdrawn", "disqualified", "rejected"];
const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

export type HardBlockerResult = {
  blocked: boolean;
  blockers: string[];
  countCategory?: CandidateFirstCountCategory;
};

export function detectCandidateFirstHardBlockers(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  onboarding: CandidateOnboardingRecord | null;
}): HardBlockerResult {
  const { row, candidate, onboarding } = input;
  const blockers: string[] = [];

  const email = row.email?.trim() || candidate.email?.trim();
  if (!email) {
    return { blocked: true, blockers: ["Invalid or missing email."], countCategory: "Invalid Email" };
  }

  const duplicateReason = duplicatePaperworkSendBlockReason({ activeOnboarding: onboarding ?? undefined });
  const notesDuplicate = (row.notes ?? []).some((n) => /duplicate/i.test(n));
  const gradeDuplicate = row.candidateGrade.gradeContributors.some((c) =>
    /duplicate/i.test(c.label),
  );
  if (duplicateReason || notesDuplicate || gradeDuplicate) {
    return {
      blocked: true,
      blockers: [duplicateReason ?? "Duplicate candidate flagged."],
      countCategory: "Duplicate",
    };
  }

  if (TERMINAL_STATUSES.has(row.workflowStatus)) {
    blockers.push(`Archived/disqualified terminal status: ${row.workflowStatus}.`);
  }
  const haystack = `${row.workflowStatus} ${row.stage} ${candidate.stage}`.toLowerCase();
  if (ARCHIVED_HINTS.some((hint) => haystack.includes(hint))) {
    blockers.push("Archived or withdrawn candidate.");
  }
  if (row.workflowStatus === "Not Qualified") {
    blockers.push("Candidate disqualified.");
  }

  if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") {
    return {
      blocked: true,
      blockers: ["Paperwork already completed."],
      countCategory: "Already Sent",
    };
  }

  if (
    row.signatureRequestId ||
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.workflowStatus === "Paperwork Sent"
  ) {
    return {
      blocked: true,
      blockers: ["Paperwork already sent."],
      countCategory: "Already Sent",
    };
  }

  if (row.workflowStatus === "Needs Review" || row.actionType === "needs-review") {
    blockers.push("Explicit manual review flag on workflow.");
  }

  const firstName = row.firstName?.trim() || candidate.firstName?.trim();
  const lastName = row.lastName?.trim() || candidate.lastName?.trim();
  if (!firstName && !lastName) {
    blockers.push("Missing candidate identity (name).");
  }

  if (blockers.length > 0) {
    return { blocked: true, blockers };
  }

  return { blocked: false, blockers: [] };
}

export function buildCandidateFirstWarnings(input: {
  row: ScoredCandidateWorkflowRow;
  originalJobStatus: ReturnType<typeof resolveOriginalJobStatus>;
  operationalFit: ReturnType<typeof findNearestActiveOperationalNeed>;
}): string[] {
  const warnings: string[] = [];
  if (input.originalJobStatus === "closed_or_unpublished") {
    warnings.push("Original Breezy ad is closed or unpublished — candidate-first analysis continues.");
  }
  if (!input.operationalFit) {
    warnings.push("No matching active published job found within territory/distance search.");
  } else if (!hasOperationalFit(input.operationalFit)) {
    warnings.push(`Weak operational fit (score ${input.operationalFit.matchScore}).`);
  }
  if (!input.row.hasResume) {
    warnings.push("Resume not on file.");
  }
  if (input.row.questionnaireIntelligence.techReady === false) {
    warnings.push("Questionnaire technology readiness not confirmed.");
  }
  return warnings;
}

function resolveCountCategory(
  action: CandidateFirstRecommendedAction,
  hard: HardBlockerResult,
): CandidateFirstCountCategory {
  if (hard.countCategory) return hard.countCategory;
  return action;
}

export function evaluateCandidateFirstPaperwork(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  jobsByPositionId: Map<string, BreezyJob>;
  publishedJobs: BreezyJob[];
  onboarding: CandidateOnboardingRecord | null;
  referenceMs?: number;
}): CandidateFirstPaperworkRow {
  const { row, candidate, jobsByPositionId, publishedJobs, onboarding } = input;
  const referenceMs = input.referenceMs ?? Date.now();

  const originalJobStatus = resolveOriginalJobStatus(row.positionId, jobsByPositionId);
  const operationalFit = findNearestActiveOperationalNeed({
    candidateCity: candidate.city || row.city || "",
    candidateState: candidate.state || row.state || "",
    publishedJobs,
  });
  const stateCode = normalizeStateCode(candidate.state || row.state || "");
  const dmTerritory = stateCode ? (getDmForState(stateCode) ?? null) : null;

  const advancement = evaluateCandidate({
    row,
    jobsByPositionId,
    advancementOptions: { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE },
    referenceMs,
  });

  const hard = detectCandidateFirstHardBlockers({ row, candidate, onboarding });
  const warnings = buildCandidateFirstWarnings({ row, originalJobStatus, operationalFit });
  const review = evaluateApplicantReview(row);
  const recruiterAssigned = !isUnassignedRecruiter(row.assignedRecruiter);

  let recommendedAction: CandidateFirstRecommendedAction = "Manual Review";
  let sendPaperworkEligible = false;
  let reason = "";
  let manualReviewReason: string | null = null;

  if (hard.blocked) {
    recommendedAction = "Do Not Send";
    reason = hard.blockers.join(" ");
  } else if (hard.blockers.some((b) => b.includes("manual review"))) {
    recommendedAction = "Manual Review";
    manualReviewReason = hard.blockers.join(" ");
    reason = manualReviewReason;
  } else if (!recruiterAssigned) {
    recommendedAction = "Assign Recruiter";
    reason = "Candidate is viable but needs recruiter assignment before paperwork send.";
    if (hasOperationalFit(operationalFit)) {
      reason += ` Operational fit: ${operationalFit!.jobName} (${operationalFit!.matchReason}).`;
    }
  } else if (review.verdict === "disqualified") {
    recommendedAction = "Do Not Send";
    reason = review.summary;
  } else if (!hasOperationalFit(operationalFit) && originalJobStatus !== "published") {
    recommendedAction = "Manual Review";
    manualReviewReason =
      "No strong operational fit and original ad is not published — recruiter/DM should confirm before send.";
    reason = manualReviewReason;
  } else if (
    review.verdict === "needs-review" ||
    review.verdict === "incomplete" ||
    review.confidence === "low"
  ) {
    recommendedAction = "Manual Review";
    manualReviewReason = review.summary;
    reason = manualReviewReason;
  } else if (
    advancement.confidence >= CANDIDATE_FIRST_CONFIDENCE_MIN &&
    (review.verdict === "qualified" || hasOperationalFit(operationalFit))
  ) {
    recommendedAction = "Send Paperwork";
    sendPaperworkEligible = true;
    reason = hasOperationalFit(operationalFit)
      ? `Operational fit confirmed — ${operationalFit!.jobName} (${operationalFit!.matchScore} score). ${review.summary}`
      : `Qualified candidate with published original job. ${review.summary}`;
  } else {
    recommendedAction = "Manual Review";
    manualReviewReason = `Confidence ${advancement.confidence}% below ${CANDIDATE_FIRST_CONFIDENCE_MIN}% or review incomplete.`;
    reason = manualReviewReason;
  }

  const candidateName =
    `${row.firstName ?? candidate.firstName ?? ""} ${row.lastName ?? candidate.lastName ?? ""}`.trim() ||
    row.candidateId;
  const city = candidate.city || row.city || "";
  const state = candidate.state || row.state || "";

  return {
    candidateId: row.candidateId,
    candidateName,
    cityState: [city, state].filter(Boolean).join(", ") || "—",
    email: row.email?.trim() || candidate.email?.trim() || null,
    phone: candidate.phone?.trim() || null,
    applicationDate: candidate.appliedDate || row.appliedDate || null,
    originalJobStatus,
    originalJobName: row.positionName || candidate.positionName || "—",
    nearestActiveNeed: operationalFit
      ? `${operationalFit.jobName} (${operationalFit.city}, ${operationalFit.state})`
      : null,
    operationalFitScore: operationalFit?.matchScore ?? null,
    recommendedAction,
    sendPaperworkEligible,
    reason,
    blockers: hard.blocked ? hard.blockers : [],
    warnings,
    manualReviewReason,
    recruiterAssigned,
    dmTerritory,
    confidence: advancement.confidence,
    hasResume: row.hasResume,
    questionnaireReady: row.questionnaireIntelligence.techReady ?? null,
    duplicateStatus: hard.countCategory === "Duplicate",
    priorPaperworkStatus: row.paperworkStatus,
    countCategory: resolveCountCategory(recommendedAction, hard),
  };
}
