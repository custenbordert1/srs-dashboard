import {
  buildCandidateSlaSnapshot,
  isMelReadyStatus,
} from "@/lib/candidate-action-sla";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  CandidateWorkflowStatus,
  RecruiterActionPriority,
} from "@/lib/candidate-workflow-types";
import {
  PROGRESSION_STAGE_LABELS,
  type CandidateProgressionDecision,
  type ProgressionStageType,
} from "@/lib/candidate-progression-engine/types";

const TERMINAL_STATUSES = new Set<CandidateWorkflowStatus>([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
]);

const WITHDRAWN_STAGE_HINTS = ["withdrawn", "archived", "rejected", "disqualified"];
const INTAKE_STATUSES = new Set<CandidateWorkflowStatus>(["Applied", "Needs Review"]);

function isWithdrawnOrArchived(row: ScoredCandidateWorkflowRow): boolean {
  const stage = row.stage.toLowerCase();
  return WITHDRAWN_STAGE_HINTS.some((hint) => stage.includes(hint));
}

function isHighConfidence(row: ScoredCandidateWorkflowRow): boolean {
  return (
    row.matchPercent >= 65 ||
    row.isTopMatch ||
    row.aiGrade === "A" ||
    row.aiGrade === "A+"
  );
}

function isQualifyingGrade(row: ScoredCandidateWorkflowRow): boolean {
  return row.aiGrade === "A" || row.aiGrade === "A+" || row.aiGrade === "B";
}

function decision(
  row: ScoredCandidateWorkflowRow,
  input: {
    progressionStageType: ProgressionStageType;
    progressionReason: string;
    progressionConfidence: number;
    progressionPriority: RecruiterActionPriority;
    shouldPersist: boolean;
  },
): CandidateProgressionDecision {
  return {
    candidateId: row.candidateId,
    recommendedStage: PROGRESSION_STAGE_LABELS[input.progressionStageType],
    progressionStageType: input.progressionStageType,
    progressionReason: input.progressionReason,
    progressionConfidence: input.progressionConfidence,
    progressionPriority: input.progressionPriority,
    shouldPersist: input.shouldPersist,
  };
}

function noProgression(row: ScoredCandidateWorkflowRow, reason: string): CandidateProgressionDecision {
  return decision(row, {
    progressionStageType: "none",
    progressionReason: reason,
    progressionConfidence: 0,
    progressionPriority: "low",
    shouldPersist: false,
  });
}

function isPaperworkComplete(row: ScoredCandidateWorkflowRow): boolean {
  return (
    row.paperworkStatus === "signed" ||
    row.workflowStatus === "Signed" ||
    isMelReadyStatus(row.workflowStatus) ||
    row.workflowStatus === "Awaiting DD Verification"
  );
}

function isInterviewComplete(row: ScoredCandidateWorkflowRow): boolean {
  return row.workflowStatus === "Qualified" || row.workflowStatus === "Paperwork Needed";
}

function isContactCompleted(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(row.lastActionAt) && !row.recruitingActions.needsFollowUp;
}

export function buildCandidateProgressionDecision(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): CandidateProgressionDecision {
  if (TERMINAL_STATUSES.has(row.workflowStatus) || isWithdrawnOrArchived(row)) {
    return noProgression(row, "Terminal or closed candidate — no stage progression.");
  }

  if (row.workflowStatus === "Not Qualified") {
    return noProgression(row, "Not qualified — no progression recommendation.");
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

  if (isPaperworkComplete(row)) {
    return decision(row, {
      progressionStageType: "ready-for-mel",
      progressionReason: "Paperwork complete — advance to MEL readiness review.",
      progressionConfidence: 91,
      progressionPriority: "high",
      shouldPersist: true,
    });
  }

  if (isInterviewComplete(row)) {
    return decision(row, {
      progressionStageType: "send-paperwork",
      progressionReason: "Interview completed — send onboarding paperwork.",
      progressionConfidence: 88,
      progressionPriority: "high",
      shouldPersist: true,
    });
  }

  const needsReviewBeyondSla =
    INTAKE_STATUSES.has(row.workflowStatus) &&
    (sla.appliedAgingSeverity === "critical" || sla.recruiterInactivitySeverity === "critical");

  if (needsReviewBeyondSla) {
    return decision(row, {
      progressionStageType: "escalate",
      progressionReason: "Needs review beyond SLA — escalate for recruiter attention.",
      progressionConfidence: 87,
      progressionPriority: "high",
      shouldPersist: true,
    });
  }

  if (
    INTAKE_STATUSES.has(row.workflowStatus) &&
    isContactCompleted(row) &&
    isQualifyingGrade(row)
  ) {
    return decision(row, {
      progressionStageType: "schedule-interview",
      progressionReason: "Contact completed — schedule recruiter interview.",
      progressionConfidence: 85,
      progressionPriority: "high",
      shouldPersist: true,
    });
  }

  if (
    row.workflowStatus === "Qualified" ||
    row.recruitingActions.recommendInterview
  ) {
    return decision(row, {
      progressionStageType: "schedule-interview",
      progressionReason: "Interview-ready — schedule interview.",
      progressionConfidence: 84,
      progressionPriority: "high",
      shouldPersist: true,
    });
  }

  if (
    INTAKE_STATUSES.has(row.workflowStatus) &&
    !row.lastActionAt &&
    isHighConfidence(row)
  ) {
    return decision(row, {
      progressionStageType: "contact-candidate",
      progressionReason: "Grade A with high confidence — contact candidate.",
      progressionConfidence: 82,
      progressionPriority: "high",
      shouldPersist: true,
    });
  }

  if (
    sla.recruiterInactivitySeverity === "critical" ||
    sla.recruiterInactivitySeverity === "warn"
  ) {
    return decision(row, {
      progressionStageType: "escalate",
      progressionReason: "Pipeline stalled — recruiter inactivity detected.",
      progressionConfidence: 72,
      progressionPriority: sla.recruiterInactivitySeverity === "critical" ? "high" : "medium",
      shouldPersist: true,
    });
  }

  if (INTAKE_STATUSES.has(row.workflowStatus) && !isQualifyingGrade(row)) {
    return noProgression(row, "Weak applicant profile — no progression recommendation.");
  }

  return noProgression(row, "No clear progression signal — monitor candidate.");
}

export function buildCandidateProgressionDecisions(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): CandidateProgressionDecision[] {
  return candidates.map((row) => buildCandidateProgressionDecision(row, referenceMs));
}
