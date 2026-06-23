import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { buildMelReadinessChecklist } from "@/lib/candidate-workspace/build-mel-readiness";
import { getDmForState, normalizeStateCode } from "@/lib/dm-territory-map";
import { evaluateApplicantReview } from "@/lib/hiring-automation-engine/evaluate-applicant-review";
import type { HiringReadinessRow, HiringReadinessStatus } from "@/lib/placement-command-center/types";

function candidateName(row: ScoredCandidateWorkflowRow): string {
  return `${row.firstName} ${row.lastName}`.trim() || row.email || "Candidate";
}

function territoryForRow(row: ScoredCandidateWorkflowRow): string {
  return getDmForState(normalizeStateCode(row.state ?? "")) ?? "Unassigned";
}

function missingRequirementsForRow(row: ScoredCandidateWorkflowRow): string[] {
  const checklist = buildMelReadinessChecklist({
    workflowStatus: row.workflowStatus,
    paperworkStatus: row.paperworkStatus,
    recruitingActions: row.recruitingActions,
  });
  const missing = checklist.filter((item) => !item.complete).map((item) => item.label);

  if (row.directDepositStatus === "requested" || row.workflowStatus === "Awaiting DD Verification") {
    missing.push("Direct deposit verification");
  }
  if (row.paperworkError) missing.push(`Paperwork error: ${row.paperworkError}`);
  if (row.dmNeedsAssignment) missing.push("DM assignment");
  if (row.recruitingActions.recommendInterview) missing.push("Interview decision");

  return [...new Set(missing)];
}

export function resolveHiringReadinessStatus(row: ScoredCandidateWorkflowRow): HiringReadinessStatus {
  const review = evaluateApplicantReview(row);

  if (
    review.verdict === "disqualified" ||
    row.workflowStatus === "Not Qualified" ||
    row.candidateGrade.grade === "D" ||
    row.paperworkError
  ) {
    return "blocked";
  }

  if (
    isMelReadyStatus(row.workflowStatus) ||
    row.workflowStatus === "Active Rep" ||
    row.workflowStatus === "Loaded in MEL"
  ) {
    return "ready-to-place";
  }

  if (row.workflowStatus === "Signed" && row.paperworkStatus === "signed") {
    return "needs-action";
  }

  if (isPaperworkPendingStatus(row.workflowStatus) || row.workflowStatus === "Qualified") {
    return "needs-action";
  }

  if (missingRequirementsForRow(row).length === 0 && review.qualified) {
    return "needs-action";
  }

  return "blocked";
}

export function buildHiringReadinessRows(
  scoredRows: ScoredCandidateWorkflowRow[],
): HiringReadinessRow[] {
  return scoredRows
    .filter((row) => row.workflowStatus !== "Loaded in MEL" && row.workflowStatus !== "Active Rep")
    .map((row) => {
      const status = resolveHiringReadinessStatus(row);
      const readyForMel = isMelReadyStatus(row.workflowStatus);
      return {
        candidateId: row.candidateId,
        candidateName: candidateName(row),
        territory: territoryForRow(row),
        city: row.city ?? "",
        state: row.state ?? "",
        status,
        candidateScore: row.candidateGrade.overallScore,
        grade: row.candidateGrade.grade,
        confidence: row.candidateGrade.confidence,
        paperworkStatus: row.paperworkStatus,
        workflowStatus: row.workflowStatus,
        readyForMel,
        missingRequirements: missingRequirementsForRow(row),
      };
    })
    .sort((a, b) => {
      const rank: Record<HiringReadinessStatus, number> = {
        "ready-to-place": 0,
        "needs-action": 1,
        blocked: 2,
      };
      return (
        rank[a.status] - rank[b.status] ||
        b.candidateScore - a.candidateScore
      );
    });
}
