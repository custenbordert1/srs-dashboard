import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import {
  buildCandidateSlaSnapshot,
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
} from "@/lib/candidate-action-sla";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { classifyPaperworkStage } from "@/lib/executive-paperwork-dashboard/classify-paperwork-stage";
import type { P157DecisionAction, P157DecisionContext } from "@/lib/p157-recruiter-decision-engine/types";

export type P157RuleMatch = {
  action: P157DecisionAction;
  signals: string[];
};

const WITHDRAWN_HINTS = ["withdrawn", "archived", "rejected", "disqualified"];

function isWithdrawn(row: ScoredCandidateWorkflowRow): boolean {
  const haystack = `${row.workflowStatus} ${row.stage}`.toLowerCase();
  return WITHDRAWN_HINTS.some((hint) => haystack.includes(hint));
}

function isPositionClosed(ctx: P157DecisionContext): boolean {
  if (!ctx.jobStatus) return false;
  const status = ctx.jobStatus.toLowerCase();
  return status !== "published" && status !== "open" && status !== "active";
}

export function evaluateP157ActionRule(input: {
  row: ScoredCandidateWorkflowRow;
  ctx: P157DecisionContext;
  paperworkStage: ReturnType<typeof classifyPaperworkStage>;
}): P157RuleMatch {
  const { row, ctx, paperworkStage } = input;
  const signals: string[] = [];

  if (ctx.isDuplicate) {
    if (ctx.duplicateReason) signals.push(ctx.duplicateReason);
    else signals.push("Duplicate candidate detected");
    return { action: "Candidate Duplicate", signals };
  }

  if (isPositionClosed(ctx)) {
    signals.push(`Position status: ${ctx.jobStatus}`);
    return { action: "Position Closed", signals };
  }

  if (
    row.workflowStatus === "Not Qualified" ||
    ctx.applicantVerdict === "disqualified" ||
    isWithdrawn(row)
  ) {
    if (ctx.applicantVerdict === "disqualified") signals.push("Applicant review disqualified");
    if (row.workflowStatus === "Not Qualified") signals.push("Workflow marked not qualified");
    return { action: "Reject Candidate", signals };
  }

  if (isMelReadyStatus(row.workflowStatus)) {
    signals.push("Candidate ready for MEL load");
    return { action: "Ready For MEL", signals };
  }

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    signals.push("Recruiter not assigned");
    if (ctx.openDemand >= 15) signals.push("High open-call demand in territory");
    return { action: "Assign Recruiter", signals };
  }

  if (
    ctx.paperworkEligible &&
    (row.workflowStatus === "Paperwork Needed" ||
      paperworkStage === "awaitingRecruiterAction" ||
      paperworkStage === "approvalQueue")
  ) {
    signals.push("Paperwork eligible");
    signals.push("Recruiter assigned");
    if (ctx.questionnaireComplete) signals.push("Questionnaire complete");
    if (!ctx.isDuplicate) signals.push("No duplicate found");
    if (ctx.coverageStatus === "Critical" || ctx.coverageStatus === "At Risk") {
      signals.push("Urgent project territory");
    }
    if (ctx.daysUntilProjectStart != null && ctx.daysUntilProjectStart <= 7) {
      signals.push(`Project begins in ${ctx.daysUntilProjectStart} days`);
    }
    return { action: "Send Paperwork", signals };
  }

  const sla = buildCandidateSlaSnapshot({
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    lastActionAt: row.lastActionAt,
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    snoozedUntil: row.snoozedUntil,
    referenceMs: ctx.referenceMs,
  });

  const followUpOverdue =
    isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs: ctx.referenceMs,
    }) || sla.followUpOverdue;

  if (
    followUpOverdue ||
    row.recruitingActions.needsFollowUp ||
    (paperworkStage === "viewed" && (row.paperworkViewCount ?? 0) >= 2)
  ) {
    if (followUpOverdue) signals.push("Follow-up overdue");
    if (row.recruitingActions.needsFollowUp) signals.push("Follow-up flagged");
    if ((row.paperworkViewCount ?? 0) >= 2) signals.push("Paperwork viewed multiple times");
    return { action: "Follow Up Today", signals };
  }

  if (
    paperworkStage === "sent" ||
    paperworkStage === "viewed" ||
    row.workflowStatus === "Paperwork Sent" ||
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed"
  ) {
    const sentHours = hoursSince(row.paperworkSentAt ?? row.lastActionAt, ctx.referenceMs);
    if (sentHours != null) signals.push(`Paperwork sent ${Math.floor(sentHours / 24)}d ago`);
    signals.push("Awaiting candidate signature");
    return { action: "Wait For Candidate", signals };
  }

  if (ctx.missingDocuments.length > 0) {
    for (const item of ctx.missingDocuments.slice(0, 3)) {
      signals.push(item);
    }
    return { action: "Request Missing Documents", signals };
  }

  if (!ctx.questionnaireComplete || ctx.questionnaireTechReady === false) {
    if (!ctx.questionnaireComplete) signals.push("Questionnaire incomplete");
    if (ctx.questionnaireTechReady === false) signals.push("Technology readiness unverified");
    return { action: "Review Questionnaire", signals };
  }

  if (
    row.dmNeedsAssignment ||
    row.recruitingActions.dmReview ||
    (ctx.coverageStatus === "Critical" && row.assignedDM === "Unassigned")
  ) {
    if (row.dmNeedsAssignment) signals.push("DM assignment needed");
    if (row.recruitingActions.dmReview) signals.push("DM review flagged");
    if (ctx.coverageStatus === "Critical") signals.push("Critical territory coverage");
    return { action: "Escalate To DM", signals };
  }

  if (ctx.paperworkBlockers.length > 0 && !ctx.paperworkEligible) {
    for (const blocker of ctx.paperworkBlockers.slice(0, 3)) {
      signals.push(blocker);
    }
    return { action: "Manual Review", signals };
  }

  if (
    row.workflowStatus === "Applied" ||
    row.workflowStatus === "Needs Review" ||
    row.workflowStatus === "Qualified" ||
    ctx.applicantVerdict === "needs-review" ||
    ctx.applicantVerdict === "incomplete"
  ) {
    signals.push(`Stage: ${row.workflowStatus}`);
    if (ctx.applicantVerdict === "incomplete") signals.push("Application data incomplete");
    return { action: "Manual Review", signals };
  }

  signals.push("No automated rule matched — recruiter judgment required");
  return { action: "Manual Review", signals };
}
