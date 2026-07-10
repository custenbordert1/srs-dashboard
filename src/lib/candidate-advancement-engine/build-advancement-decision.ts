import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { isGradeAllowedForPaperwork } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import type {
  CandidateAdvancementAction,
  CandidateAdvancementDecision,
  CandidateAdvancementEngineOptions,
} from "@/lib/candidate-advancement-engine/types";

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
  "Ready for MEL",
]);

const SKIP_STATUSES = new Set<CandidateWorkflowStatus>([
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
]);

const SCREEN_STATUSES = new Set<CandidateWorkflowStatus>([
  "Applied",
  "Needs Review",
  "Qualified",
]);

const SCREEN_ACTION_TYPES = new Set(["screen-candidate", "needs-review"]);

function hasContributor(row: ScoredCandidateWorkflowRow, fragment: string): boolean {
  return row.candidateGrade.gradeContributors.some((item) =>
    item.label.toLowerCase().includes(fragment.toLowerCase()),
  );
}

function hasActivePacket(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

function hasPublishedJobMatch(
  row: ScoredCandidateWorkflowRow,
  jobsByPositionId: Map<string, BreezyJob>,
): boolean {
  return Boolean(row.positionId?.trim() && jobsByPositionId.has(row.positionId));
}

function isScreenStage(row: ScoredCandidateWorkflowRow): boolean {
  if (SCREEN_STATUSES.has(row.workflowStatus)) return true;
  const actionType = row.actionType ?? "none";
  return SCREEN_ACTION_TYPES.has(actionType);
}

function hasQuestionnaireGap(row: ScoredCandidateWorkflowRow): boolean {
  return (
    row.questionnaireIntelligence.techReady === false ||
    hasContributor(row, "Transportation not confirmed")
  );
}

function noDecision(row: ScoredCandidateWorkflowRow, reason: string): CandidateAdvancementDecision {
  return {
    candidateId: row.candidateId,
    action: "none",
    reason,
    confidence: 0,
    shouldAdvance: false,
    shouldPersist: false,
    requiresApproval: false,
  };
}

function decision(
  row: ScoredCandidateWorkflowRow,
  input: {
    action: CandidateAdvancementAction;
    reason: string;
    confidence: number;
    shouldAdvance: boolean;
    shouldPersist: boolean;
    requiresApproval?: boolean;
  },
): CandidateAdvancementDecision {
  return {
    candidateId: row.candidateId,
    action: input.action,
    reason: input.reason,
    confidence: input.confidence,
    shouldAdvance: input.shouldAdvance,
    shouldPersist: input.shouldPersist,
    requiresApproval: input.requiresApproval ?? false,
  };
}

export function buildCandidateAdvancementDecision(
  row: ScoredCandidateWorkflowRow,
  options: CandidateAdvancementEngineOptions,
): CandidateAdvancementDecision {
  if (!isScreenStage(row)) {
    return noDecision(row, "Not at screen stage — advancement not evaluated.");
  }

  if (TERMINAL_STATUSES.has(row.workflowStatus)) {
    return noDecision(row, "Terminal workflow — advancement skipped.");
  }

  if (SKIP_STATUSES.has(row.workflowStatus)) {
    return noDecision(row, "Already in paperwork funnel — advancement skipped.");
  }

  if (hasActivePacket(row)) {
    return noDecision(row, "Active paperwork packet — advancement skipped.");
  }

  if (row.paperworkStatus === "signed") {
    return noDecision(row, "Paperwork signed — advancement skipped.");
  }

  const review = evaluateApplicantReview(row);
  const requireApproval = options.requireApproval ?? true;

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    return decision(row, {
      action: "hold",
      reason: "Awaiting recruiter assignment before advancement.",
      confidence: 70,
      shouldAdvance: false,
      shouldPersist: true,
    });
  }

  if (!row.email?.trim()) {
    return decision(row, {
      action: "hold",
      reason: "Missing contact email — hold until resolved.",
      confidence: 75,
      shouldAdvance: false,
      shouldPersist: true,
    });
  }

  const publishedJobMatch = hasPublishedJobMatch(row, options.jobsByPositionId);
  if (!publishedJobMatch) {
    // Candidate-first: closed/unpublished original ad does not hard-block advancement evaluation.
  }

  if (review.verdict === "disqualified") {
    return decision(row, {
      action: "reject",
      reason: review.summary,
      confidence: 85,
      shouldAdvance: false,
      shouldPersist: true,
    });
  }

  if (hasQuestionnaireGap(row)) {
    const gaps = [
      row.questionnaireIntelligence.techReady === false ? "technology readiness" : null,
      hasContributor(row, "Transportation not confirmed") ? "transportation" : null,
    ].filter(Boolean);
    return decision(row, {
      action: "call-first",
      reason: `Verification needed before paperwork: ${gaps.join(" and ")}.`,
      confidence: 82,
      shouldAdvance: false,
      shouldPersist: true,
    });
  }

  if (review.verdict === "incomplete") {
    return decision(row, {
      action: "hold",
      reason: review.summary,
      confidence: 72,
      shouldAdvance: false,
      shouldPersist: true,
    });
  }

  if (review.confidence === "low") {
    return decision(row, {
      action: "call-first",
      reason: "Low confidence grade — recruiter contact required before paperwork.",
      confidence: 76,
      shouldAdvance: false,
      shouldPersist: true,
    });
  }

  if (review.verdict === "needs-review") {
    return decision(row, {
      action: "call-first",
      reason: review.summary,
      confidence: 80,
      shouldAdvance: false,
      shouldPersist: true,
    });
  }

  if (review.verdict === "qualified") {
    if (!isGradeAllowedForPaperwork(row.aiGrade, options.paperworkByGrade)) {
      return decision(row, {
        action: "hold",
        reason: `Grade ${row.aiGrade} not approved for paperwork per onboarding policy.`,
        confidence: 77,
        shouldAdvance: false,
        shouldPersist: true,
      });
    }

    const p83Reason = publishedJobMatch
      ? `P83 autonomous advancement — Grade ${review.grade} (${review.confidence} confidence), questionnaire verified, job active.`
      : `P83 autonomous advancement — Grade ${review.grade} (${review.confidence} confidence), questionnaire verified; original ad closed — candidate-first path.`;
    const shouldAdvance = !requireApproval;

    return decision(row, {
      action: "send-paperwork",
      reason: p83Reason,
      confidence: review.confidence === "high" ? 90 : 85,
      shouldAdvance,
      shouldPersist: true,
      requiresApproval: requireApproval,
    });
  }

  return noDecision(row, "No advancement signal — monitor candidate.");
}

export function buildCandidateAdvancementDecisions(
  candidates: ScoredCandidateWorkflowRow[],
  options: CandidateAdvancementEngineOptions,
): CandidateAdvancementDecision[] {
  return candidates.map((row) => buildCandidateAdvancementDecision(row, options));
}
