import {
  buildCandidateSlaSnapshot,
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
} from "@/lib/candidate-action-sla";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { isNewlyAppliedCandidate, matchesRecruiterQuickFilter } from "@/lib/recruiter-action-queue-filters";
import { isActionOverdue } from "@/lib/recruiter-priority";
import {
  RECRUITER_WORK_CATEGORY_LABELS,
  RECRUITER_WORK_CATEGORY_ORDER,
  type RecruiterWorkCategoryId,
} from "@/lib/recruiter-command-center/types";

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
]);

function isSlaRisk(
  row: ScoredCandidateWorkflowRow,
  referenceMs: number,
): boolean {
  const sla = buildCandidateSlaSnapshot({
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    lastActionAt: row.lastActionAt,
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    snoozedUntil: row.snoozedUntil,
    referenceMs,
  });
  return (
    sla.appliedAgingSeverity === "critical" ||
    sla.paperworkAgingSeverity === "critical" ||
    sla.recruiterInactivitySeverity === "critical" ||
    sla.followUpOverdue
  );
}

function isAwaitingSignature(
  row: ScoredCandidateWorkflowRow,
  onboarding: CandidateOnboardingRecord | null,
): boolean {
  const stage = classifyPaperworkStage({ row, onboarding });
  return stage === "sent" || stage === "viewed";
}

function isReadyForPaperwork(
  row: ScoredCandidateWorkflowRow,
  onboarding: CandidateOnboardingRecord | null,
): boolean {
  const stage = classifyPaperworkStage({ row, onboarding });
  return (
    stage === "awaitingRecruiterAction" ||
    row.workflowStatus === "Paperwork Needed"
  );
}

function isApprovalQueuePaperwork(
  row: ScoredCandidateWorkflowRow,
  onboarding: CandidateOnboardingRecord | null,
): boolean {
  return classifyPaperworkStage({ row, onboarding }) === "approvalQueue";
}

export function matchesRecruiterWorkCategory(
  category: RecruiterWorkCategoryId,
  row: ScoredCandidateWorkflowRow,
  onboarding: CandidateOnboardingRecord | null,
  actionOverdue: boolean,
  referenceMs: number,
): boolean {
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return false;

  switch (category) {
    case "overdue-actions":
      return (
        actionOverdue ||
        isFollowUpOverdue({
          recruitingActions: row.recruitingActions,
          followUpDueAt: row.followUpDueAt,
          referenceMs,
        })
      );
    case "sla-risks":
      return isSlaRisk(row, referenceMs);
    case "awaiting-signature":
      return isAwaitingSignature(row, onboarding);
    case "ready-for-mel":
      return isMelReadyStatus(row.workflowStatus);
    case "ready-for-paperwork":
      return isReadyForPaperwork(row, onboarding) || isApprovalQueuePaperwork(row, onboarding);
    case "ready-for-interview":
      return (
        row.recruitingActions.recommendInterview ||
        row.workflowStatus === "Qualified"
      );
    case "needs-review":
      return matchesRecruiterQuickFilter(row, "needs-review", "", referenceMs);
    case "new-applicants":
      return isNewlyAppliedCandidate(row, referenceMs);
    default:
      return false;
  }
}

export function assignRecruiterWorkCategory(
  row: ScoredCandidateWorkflowRow,
  onboarding: CandidateOnboardingRecord | null,
  actionOverdue: boolean,
  referenceMs: number,
): RecruiterWorkCategoryId {
  for (const category of RECRUITER_WORK_CATEGORY_ORDER) {
    if (matchesRecruiterWorkCategory(category, row, onboarding, actionOverdue, referenceMs)) {
      return category;
    }
  }
  return "new-applicants";
}

export function resolveQueueAgeHours(
  row: ScoredCandidateWorkflowRow,
  referenceMs: number,
): number | null {
  const touch = row.lastActionAt ?? row.appliedDate;
  return hoursSince(touch, referenceMs);
}

export function categoryLabel(category: RecruiterWorkCategoryId): string {
  return RECRUITER_WORK_CATEGORY_LABELS[category];
}

export { isActionOverdue };
