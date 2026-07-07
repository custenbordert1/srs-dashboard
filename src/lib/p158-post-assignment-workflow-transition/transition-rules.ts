import type { BreezyCandidate } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { detectImmediatePaperworkHardBlockers } from "@/lib/p152-immediate-paperwork-policy/detect-immediate-paperwork-hard-blockers";
import type { PaperworkAutomationAuditEvent } from "@/lib/p145-controlled-paperwork-automation/types";

const ARCHIVED_HINTS = ["archived", "withdrawn", "rejected", "disqualified"];
const PROTECTED_WORKFLOW_STATUSES = new Set([
  "Paperwork Sent",
  "Signed",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
  "Not Qualified",
]);
const PROTECTED_PAPERWORK_STATUSES = new Set(["sent", "viewed", "signed"]);

export type P1583TransitionEligibility = {
  eligible: boolean;
  alreadyTransitioned: boolean;
  blocked: boolean;
  blockers: string[];
  skipReason: string | null;
};

function isArchived(row: ScoredCandidateWorkflowRow, candidate: BreezyCandidate): boolean {
  const haystack = `${row.workflowStatus} ${row.stage} ${candidate.stage}`.toLowerCase();
  return ARCHIVED_HINTS.some((hint) => haystack.includes(hint));
}

function hasExplicitManualReviewFlag(
  row: ScoredCandidateWorkflowRow,
  workflow: CandidateWorkflowRecord,
): boolean {
  if (row.workflowStatus === "Needs Review") return true;
  if (row.actionType === "needs-review") return true;
  if (workflow.recruitingActions?.dmReview) return true;
  if (workflow.recruitingActions?.needsFollowUp && row.workflowStatus === "Applied") return false;
  return false;
}

export function evaluateTransitionEligibility(input: {
  row: ScoredCandidateWorkflowRow;
  candidate: BreezyCandidate;
  workflow: CandidateWorkflowRecord;
  onboarding: CandidateOnboardingRecord | null;
  auditEvents: PaperworkAutomationAuditEvent[];
}): P1583TransitionEligibility {
  const { row, candidate, workflow, onboarding, auditEvents } = input;
  const blockers: string[] = [];

  if (PROTECTED_WORKFLOW_STATUSES.has(row.workflowStatus)) {
    return {
      eligible: false,
      alreadyTransitioned: row.workflowStatus === "Paperwork Needed",
      blocked: true,
      blockers: [`Protected workflow status: ${row.workflowStatus}`],
      skipReason: `Cannot transition — status is ${row.workflowStatus}`,
    };
  }

  if (PROTECTED_PAPERWORK_STATUSES.has(row.paperworkStatus ?? "not_sent")) {
    return {
      eligible: false,
      alreadyTransitioned: false,
      blocked: true,
      blockers: [`Paperwork already ${row.paperworkStatus}`],
      skipReason: "Paperwork already sent or completed",
    };
  }

  if (
    row.workflowStatus === "Paperwork Needed" &&
    (row.actionType === "send-paperwork" || workflow.actionType === "send-paperwork")
  ) {
    return {
      eligible: false,
      alreadyTransitioned: true,
      blocked: false,
      blockers: [],
      skipReason: "Already at Paperwork Needed with send-paperwork",
    };
  }

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    blockers.push("Recruiter not assigned");
  }
  if (isUnassignedRecruiter(row.assignedDM ?? workflow.assignedDM)) {
    blockers.push("DM not assigned");
  }

  const hard = detectImmediatePaperworkHardBlockers({
    row,
    candidate,
    onboarding,
    auditEvents,
  });
  if (hard.blocked) {
    blockers.push(...hard.blockers);
  }

  if (row.workflowStatus === "Not Qualified" || isArchived(row, candidate)) {
    blockers.push("Candidate disqualified or archived");
  }

  if (hasExplicitManualReviewFlag(row, workflow)) {
    blockers.push("Explicit manual review flag");
  }

  if (blockers.length > 0) {
    return {
      eligible: false,
      alreadyTransitioned: false,
      blocked: true,
      blockers,
      skipReason: blockers[0] ?? "Transition blocked",
    };
  }

  return {
    eligible: true,
    alreadyTransitioned: false,
    blocked: false,
    blockers: [],
    skipReason: null,
  };
}

export function shouldSkipTransitionForProtectedState(workflow: CandidateWorkflowRecord): boolean {
  if (PROTECTED_WORKFLOW_STATUSES.has(workflow.workflowStatus)) return true;
  if (PROTECTED_PAPERWORK_STATUSES.has(workflow.paperworkStatus ?? "not_sent")) return true;
  return false;
}
