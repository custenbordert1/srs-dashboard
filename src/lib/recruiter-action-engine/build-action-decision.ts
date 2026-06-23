import {
  buildCandidateSlaSnapshot,
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
} from "@/lib/candidate-action-sla";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import {
  RECRUITER_ACTION_LABELS,
  type RecruiterActionDecision,
  type RecruiterActionPriority,
  type RecruiterActionType,
} from "@/lib/recruiter-action-engine/types";

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
]);

const WITHDRAWN_STAGE_HINTS = ["withdrawn", "archived", "rejected", "disqualified"];

function isUnassignedRecruiter(name: string): boolean {
  const trimmed = name.trim();
  return !trimmed || trimmed === "Unassigned" || trimmed === "Recruiting Team";
}

function isWithdrawnOrArchived(row: ScoredCandidateWorkflowRow): boolean {
  const stage = row.stage.toLowerCase();
  return WITHDRAWN_STAGE_HINTS.some((hint) => stage.includes(hint));
}

function todayDate(referenceMs: number): string {
  return new Date(referenceMs).toISOString().slice(0, 10);
}

function dueInDays(referenceMs: number, days: number): string {
  const d = new Date(referenceMs);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function decision(
  row: ScoredCandidateWorkflowRow,
  input: {
    actionType: RecruiterActionType;
    actionPriority: RecruiterActionPriority;
    actionReason: string;
    actionDueDate: string;
    actionConfidence: number;
    shouldPersist: boolean;
  },
): RecruiterActionDecision {
  return {
    candidateId: row.candidateId,
    requiredAction: RECRUITER_ACTION_LABELS[input.actionType],
    actionType: input.actionType,
    actionPriority: input.actionPriority,
    actionReason: input.actionReason,
    actionDueDate: input.actionDueDate,
    actionConfidence: input.actionConfidence,
    shouldPersist: input.shouldPersist,
  };
}

function noAction(row: ScoredCandidateWorkflowRow, reason: string): RecruiterActionDecision {
  return decision(row, {
    actionType: "none",
    actionPriority: "low",
    actionReason: reason,
    actionDueDate: todayDate(Date.now()),
    actionConfidence: 0,
    shouldPersist: false,
  });
}

export function buildRecruiterActionDecision(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): RecruiterActionDecision {
  if (TERMINAL_STATUSES.has(row.workflowStatus) || isWithdrawnOrArchived(row)) {
    return noAction(row, "Terminal or closed candidate — no recruiter action.");
  }

  if (isUnassignedRecruiter(row.assignedRecruiter)) {
    return noAction(row, "Awaiting recruiter assignment (P62).");
  }

  const sla = buildCandidateSlaSnapshot({
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    lastActionAt: row.lastActionAt,
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    snoozedUntil: row.snoozedUntil,
    referenceMs,
  });

  const today = todayDate(referenceMs);

  if (
    isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs,
    }) ||
    sla.followUpOverdue
  ) {
    return decision(row, {
      actionType: "follow-up",
      actionPriority: "high",
      actionReason: "Follow-up is overdue — candidate needs contact today.",
      actionDueDate: today,
      actionConfidence: 92,
      shouldPersist: true,
    });
  }

  if (row.recruitingActions.recommendInterview || row.workflowStatus === "Qualified") {
    return decision(row, {
      actionType: "schedule-interview",
      actionPriority: "high",
      actionReason:
        row.recruitingActions.recommendInterview
          ? "Interview-ready flag set — schedule interview."
          : "Qualified candidate — schedule interview.",
      actionDueDate: today,
      actionConfidence: 88,
      shouldPersist: true,
    });
  }

  if (row.workflowStatus === "Paperwork Needed") {
    return decision(row, {
      actionType: "send-paperwork",
      actionPriority: "high",
      actionReason: "Interview passed — send onboarding paperwork.",
      actionDueDate: today,
      actionConfidence: 90,
      shouldPersist: true,
    });
  }

  if (row.workflowStatus === "Paperwork Sent") {
    if (row.paperworkStatus === "viewed") {
      const viewedHours = hoursSince(row.paperworkViewedAt, referenceMs);
      return decision(row, {
        actionType: "follow-up",
        actionPriority: viewedHours != null && viewedHours >= 24 ? "high" : "medium",
        actionReason:
          (row.paperworkViewCount ?? 0) >= 2
            ? "Paperwork viewed multiple times — call candidate."
            : "Paperwork viewed — follow up for signature.",
        actionDueDate: today,
        actionConfidence: 85,
        shouldPersist: true,
      });
    }
    const sentHours = hoursSince(row.paperworkSentAt ?? row.lastActionAt, referenceMs);
    const daysSinceSent = sentHours != null ? Math.floor(sentHours / 24) : 0;
    return decision(row, {
      actionType: "await-signature",
      actionPriority: sla.paperworkAgingSeverity === "critical" ? "high" : daysSinceSent >= 1 ? "medium" : "low",
      actionReason:
        daysSinceSent >= 1
          ? `Paperwork sent ${daysSinceSent} day${daysSinceSent === 1 ? "" : "s"} ago — awaiting signature.`
          : "Paperwork sent — awaiting signature.",
      actionDueDate: daysSinceSent >= 1 ? today : dueInDays(referenceMs, 3),
      actionConfidence: 80,
      shouldPersist: true,
    });
  }

  if (isMelReadyStatus(row.workflowStatus)) {
    return decision(row, {
      actionType: "load-mel",
      actionPriority: "high",
      actionReason: "Candidate is ready for MEL — complete load review.",
      actionDueDate: today,
      actionConfidence: 91,
      shouldPersist: true,
    });
  }

  if (row.workflowStatus === "Signed" || row.paperworkStatus === "signed") {
    return decision(row, {
      actionType: "verify-paperwork",
      actionPriority: "medium",
      actionReason: "Signed paperwork — verify and advance to MEL readiness.",
      actionDueDate: today,
      actionConfidence: 86,
      shouldPersist: true,
    });
  }

  if (row.workflowStatus === "Awaiting DD Verification") {
    return decision(row, {
      actionType: "await-dd",
      actionPriority: "medium",
      actionReason: "Awaiting direct deposit verification from candidate.",
      actionDueDate: dueInDays(referenceMs, 2),
      actionConfidence: 75,
      shouldPersist: true,
    });
  }

  if (row.workflowStatus === "Training Needed") {
    return decision(row, {
      actionType: "training",
      actionPriority: "medium",
      actionReason: "Schedule training and confirm rep readiness.",
      actionDueDate: dueInDays(referenceMs, 2),
      actionConfidence: 70,
      shouldPersist: true,
    });
  }

  if (row.workflowStatus === "Applied" || row.workflowStatus === "Needs Review") {
    const qualifyingScore = row.matchPercent >= 65 || row.isTopMatch || row.aiGrade === "A";
    if (row.workflowStatus === "Needs Review" && !row.lastActionAt) {
      return decision(row, {
        actionType: "needs-review",
        actionPriority: qualifyingScore ? "high" : "medium",
        actionReason: qualifyingScore
          ? "Needs review with qualifying score — disposition today."
          : "Application needs recruiter review.",
        actionDueDate: today,
        actionConfidence: qualifyingScore ? 84 : 72,
        shouldPersist: true,
      });
    }
    return decision(row, {
      actionType: "screen-candidate",
      actionPriority: qualifyingScore ? "high" : "medium",
      actionReason: qualifyingScore
        ? "New applicant with qualifying score — screen candidate."
        : "New applicant — screen and qualify.",
      actionDueDate: today,
      actionConfidence: qualifyingScore ? 82 : 68,
      shouldPersist: true,
    });
  }

  if (row.recruitingActions.needsFollowUp) {
    return decision(row, {
      actionType: "follow-up",
      actionPriority: "medium",
      actionReason: "Follow-up flagged — re-engage candidate.",
      actionDueDate: today,
      actionConfidence: 78,
      shouldPersist: true,
    });
  }

  return decision(row, {
    actionType: "follow-up",
    actionPriority: "low",
    actionReason: "Monitor pipeline — no urgent action detected.",
    actionDueDate: dueInDays(referenceMs, 3),
    actionConfidence: 55,
    shouldPersist: true,
  });
}

export function buildRecruiterActionDecisions(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): RecruiterActionDecision[] {
  return candidates.map((row) => buildRecruiterActionDecision(row, referenceMs));
}
