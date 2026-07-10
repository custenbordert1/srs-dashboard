import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { detectCandidateFirstHardBlockers } from "@/lib/candidate-first-paperwork-eligibility/evaluate-candidate-first-paperwork";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { P157CandidateDecision } from "@/lib/p157-recruiter-decision-engine/types";
import type { ImmediateHardBlockerResult } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import type { RecruiterAssignmentCandidateRow } from "@/lib/p151-autonomous-recruiter-assignment/types";

const BLOCKED_P157_ACTIONS = new Set<P157CandidateDecision["action"]>([
  "Candidate Duplicate",
  "Manual Review",
  "Reject Candidate",
  "Position Closed",
  "Review Questionnaire",
  "Request Missing Documents",
  "Escalate To DM",
]);

export function isBlockedOnlyByUnassignedRecruiter(hard: ImmediateHardBlockerResult): boolean {
  return hard.blocked && hard.primaryHardBlocker === "unassigned_recruiter";
}

export function passesP176AssignmentGates(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  onboarding: CandidateOnboardingRecord | null;
  p157: P157CandidateDecision | null;
  p152: ImmediateHardBlockerResult;
}): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const first = detectCandidateFirstHardBlockers({
    row: input.row,
    candidate: input.candidate,
    onboarding: input.onboarding,
  });

  if (first.blocked) {
    reasons.push(...first.blockers);
  }

  if (input.p157 && BLOCKED_P157_ACTIONS.has(input.p157.action)) {
    reasons.push(`P157 blocks assignment: ${input.p157.action}`);
  }

  if (!isBlockedOnlyByUnassignedRecruiter(input.p152)) {
    if (!input.p152.blocked) {
      reasons.push("P152 already eligible — recruiter assignment not required for paperwork gate.");
    } else {
      reasons.push(...input.p152.blockers);
    }
  }

  if (input.p152.primaryHardBlocker === "duplicate_candidate") {
    reasons.push("Duplicate paperwork risk.");
  }

  if (input.p152.primaryHardBlocker === "active_signature_request") {
    reasons.push("Active signature request exists.");
  }

  return { eligible: reasons.length === 0, reasons };
}

export function shouldApplyRecruiterAssignment(input: {
  gates: { eligible: boolean; reasons: string[] };
  assignmentEval: RecruiterAssignmentCandidateRow;
}): { apply: boolean; reason: string } {
  if (!input.gates.eligible) {
    return { apply: false, reason: input.gates.reasons.join(" ") };
  }
  if (
    input.assignmentEval.recommendation !== "Assign Recruiter" ||
    !input.assignmentEval.autoAssignEligible
  ) {
    return {
      apply: false,
      reason: `${input.assignmentEval.recommendation}: ${input.assignmentEval.reason}`,
    };
  }
  if (!input.assignmentEval.recommendedRecruiter) {
    return { apply: false, reason: "No recruiter recommendation from assignment engine." };
  }
  return { apply: true, reason: input.assignmentEval.reason };
}
