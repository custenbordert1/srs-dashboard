import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { detectCandidateFirstHardBlockers } from "@/lib/candidate-first-paperwork-eligibility/evaluate-candidate-first-paperwork";
import {
  findNearestActiveOperationalNeed,
  hasOperationalFit,
} from "@/lib/candidate-first-paperwork-eligibility/match-active-operational-need";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import type {
  RecruiterAssignmentCandidateRow,
  RecruiterAssignmentRecommendation,
} from "@/lib/p151-autonomous-recruiter-assignment/types";
import { RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD } from "@/lib/recruiter-assignment-engine/types";
import type { RecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/types";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";

export function evaluateRecruiterAssignmentCandidate(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  assignment: RecruiterAssignmentDecision;
  jobsByPositionId: Map<string, BreezyJob>;
  publishedJobs: BreezyJob[];
  onboarding: CandidateOnboardingRecord | null;
  referenceMs?: number;
}): RecruiterAssignmentCandidateRow {
  const { row, candidate, assignment, jobsByPositionId, publishedJobs, onboarding } = input;
  const referenceMs = input.referenceMs ?? Date.now();
  const stateCode = normalizeStateCode(candidate.state || row.state || "");
  const dmTerritory = stateCode ? (getDmForState(stateCode) ?? null) : null;
  const operationalFit = findNearestActiveOperationalNeed({
    candidateCity: candidate.city || "",
    candidateState: candidate.state || "",
    publishedJobs,
  });
  const advancement = evaluateCandidate({
    row,
    jobsByPositionId,
    advancementOptions: { jobsByPositionId, paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE },
    referenceMs,
    coveragePressure: Math.min(100, 40 + (row.matchPercent >= 70 ? 30 : 0)),
  });
  const hard = detectCandidateFirstHardBlockers({ row, candidate, onboarding });
  const review = evaluateApplicantReview(row);
  const blockers = [...hard.blockers];

  let recommendation: RecruiterAssignmentRecommendation = "Hold";
  let autoAssignEligible = false;
  let reason = assignment.reason;

  if (hard.blocked && (hard.countCategory === "Duplicate" || review.verdict === "disqualified")) {
    recommendation = "Do Not Assign";
    reason = hard.blockers.join(" ") || review.summary;
  } else if (hard.blocked) {
    recommendation = "Do Not Assign";
    reason = hard.blockers.join(" ");
  } else if (!isUnassignedRecruiter(row.assignedRecruiter)) {
    recommendation = "Hold";
    reason = `Recruiter already assigned: ${row.assignedRecruiter}.`;
  } else if (row.workflowStatus === "Needs Review" || row.actionType === "needs-review") {
    recommendation = "Manual Review";
    reason = "Explicit manual review required before recruiter assignment.";
  } else if (review.verdict === "disqualified") {
    recommendation = "Do Not Assign";
    reason = review.summary;
  } else if (assignment.shouldAssign) {
    recommendation = "Assign Recruiter";
    autoAssignEligible = true;
    reason = assignment.reason;
  } else if (!assignment.territoryState) {
    recommendation = "Manual Review";
    reason = assignment.reason || "Territory could not be determined.";
  } else if (assignment.confidence < RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD) {
    recommendation = "Manual Review";
    reason = assignment.reason;
  } else {
    recommendation = "Hold";
    reason = assignment.reason;
  }

  if (
    recommendation === "Assign Recruiter" &&
    !hasOperationalFit(operationalFit) &&
    advancement.confidence < 60
  ) {
    recommendation = "Manual Review";
    autoAssignEligible = false;
    reason = "Low operational fit and advancement confidence — manual review before assignment.";
  }

  const candidateName =
    `${row.firstName ?? candidate.firstName ?? ""} ${row.lastName ?? candidate.lastName ?? ""}`.trim() ||
    row.candidateId;

  return {
    candidateId: row.candidateId,
    candidateName,
    cityState: [candidate.city, candidate.state].filter(Boolean).join(", ") || "—",
    zip: candidate.zipCode?.trim() || null,
    distanceMiles: row.distanceMiles,
    dmTerritory,
    recruiterTerritory: assignment.territoryState,
    assignedRecruiter: row.assignedRecruiter || "Unassigned",
    recommendedRecruiter: assignment.shouldAssign ? assignment.recruiter : assignment.recruiter || null,
    assignmentConfidence: assignment.confidence,
    advancementConfidence: advancement.confidence,
    operationalFitScore: operationalFit?.matchScore ?? null,
    coveragePressure: advancement.coverageNeedScore,
    duplicateStatus: hard.countCategory === "Duplicate",
    recommendation,
    autoAssignEligible,
    reason,
    blockers,
    assignmentReason: assignment.reason,
  };
}
