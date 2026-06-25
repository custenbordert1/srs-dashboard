import {
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isFollowUpOverdue } from "@/lib/candidate-action-sla";
import {
  APPROVAL_HIGH_PRIORITY_THRESHOLD,
  APPROVAL_MEDIUM_PRIORITY_THRESHOLD,
  queueGradeBoost,
} from "@/lib/recruiter-priority/constants";
import {
  gradePriorityScore,
  intelligenceSignalBoost,
  positionUrgencyBoost,
  queueAgeBoost,
  recruiterWorkloadBoost,
  resolveConfidenceScore,
  resolvePriorityLevel,
  slaSeverityBoost,
} from "@/lib/recruiter-priority/building-blocks";
import type {
  ApprovalPriorityContext,
  QueuePriorityContext,
  RecruiterPriorityInput,
  RecruiterPriorityResult,
} from "@/lib/recruiter-priority/types";
import {
  COMMAND_CENTER_HIGH_PRIORITY_THRESHOLD,
  COMMAND_CENTER_MEDIUM_PRIORITY_THRESHOLD,
} from "@/lib/recruiter-priority/constants";
import { isActionOverdue } from "@/lib/recruiter-priority/compare-action-priority";

export function scoreQueuePriority(input: QueuePriorityContext): RecruiterPriorityResult {
  const { row, sla } = input;
  const reasons: string[] = [];
  let score = row.aiNumericScore + queueGradeBoost(row.aiGrade);

  if (row.recruitingActions.priorityList) {
    score += 30;
    reasons.push("Priority list");
  }
  if (row.recruitingActions.dmReview) {
    score += 8;
    reasons.push("DM review");
  }
  if (row.recruitingActions.recommendInterview) {
    score += 10;
    reasons.push("Interview flagged");
  }
  if (row.recruitingActions.onboardingPacketPrep) {
    score += 6;
    reasons.push("Onboarding prep");
  }
  if (row.recruitingActions.needsFollowUp || row.followUpDueAt) {
    score += sla.followUpOverdue ? 28 : 16;
    reasons.push(sla.followUpOverdue ? "Follow-up overdue" : "Follow-up scheduled");
  }
  if (sla.appliedAgingSeverity !== "none") {
    score += slaSeverityBoost(sla.appliedAgingSeverity);
    reasons.push(`Applied ${sla.appliedDays ?? "?"}d`);
  }
  if (sla.paperworkAgingSeverity !== "none") {
    score += slaSeverityBoost(sla.paperworkAgingSeverity);
    reasons.push("Paperwork waiting");
  }
  if (isMelReadyStatus(row.workflowStatus)) {
    score += 14;
    reasons.push("MEL ready");
  }
  if (sla.recruiterInactivitySeverity !== "none") {
    score += slaSeverityBoost(sla.recruiterInactivitySeverity);
    reasons.push(`Inactive ${sla.statusDays ?? "?"}d`);
  }
  if (row.isTopMatch) {
    score += 12;
    reasons.push("Top match");
  }
  if (row.dmNeedsAssignment) {
    score += 6;
    reasons.push(`DM suggest ${row.suggestedDM}`);
  }

  return {
    priorityScore: score,
    priorityLevel: resolvePriorityLevel(
      score,
      COMMAND_CENTER_HIGH_PRIORITY_THRESHOLD,
      COMMAND_CENTER_MEDIUM_PRIORITY_THRESHOLD,
    ),
    priorityReasons: reasons.length > 0 ? reasons : [row.nextActionNeeded],
  };
}

export function scoreApprovalQueuePriority(input: ApprovalPriorityContext): RecruiterPriorityResult {
  const confidenceScore = resolveConfidenceScore(input.row);
  const gradeScore = gradePriorityScore(input.row.aiGrade);
  const ageScore = queueAgeBoost(input.queueAgeHours);
  const urgencyScore = positionUrgencyBoost(input.positionUrgency);
  const workloadScore = recruiterWorkloadBoost(input.recruiterQueueCount);
  const intelligenceScore = intelligenceSignalBoost(input.row);

  const priorityScore =
    gradeScore + confidenceScore + ageScore + urgencyScore + workloadScore + intelligenceScore;

  const priorityReasons: string[] = [];
  if (gradeScore >= 20) priorityReasons.push(`Grade ${input.row.aiGrade}`);
  if (confidenceScore >= 14) priorityReasons.push("High confidence");
  if (ageScore >= 10) priorityReasons.push("Aging in queue");
  if (urgencyScore >= 10) priorityReasons.push(`${input.positionUrgency} position urgency`);
  if (workloadScore >= 8) priorityReasons.push("Recruiter queue bottleneck");
  if (intelligenceScore >= 5) priorityReasons.push("Strong recruiting intelligence signals");
  if (priorityReasons.length === 0) priorityReasons.push("Standard queue priority");

  return {
    priorityScore,
    priorityLevel: resolvePriorityLevel(
      priorityScore,
      APPROVAL_HIGH_PRIORITY_THRESHOLD,
      APPROVAL_MEDIUM_PRIORITY_THRESHOLD,
    ),
    priorityReasons,
  };
}

export function scoreInboxPriority(input: {
  sectionScore: number;
  row: QueuePriorityContext["row"];
}): number {
  const base = input.sectionScore * 100;
  const gradeBoost = input.row.candidateGrade?.overallScore ?? 0;
  const techPenalty = input.row.questionnaireIntelligence?.techReady === false ? 12 : 0;
  const paperworkBoost = input.row.candidateGrade?.paperworkReady ? 8 : 0;
  return base + gradeBoost * 0.15 + paperworkBoost - techPenalty;
}

/** Unified command-center priority — blends queue SLA scoring with coverage and action urgency. */
export function scoreRecruiterWorkItemPriority(input: RecruiterPriorityInput): RecruiterPriorityResult {
  const referenceMs = input.referenceMs ?? Date.now();
  const row = input.row;
  const sla = input.sla;
  const reasons: string[] = [];

  let score = 0;

  if (sla) {
    const queueResult = scoreQueuePriority({ row, sla });
    score += queueResult.priorityScore * 0.55;
    reasons.push(...queueResult.priorityReasons.slice(0, 3));
  } else {
    score += row.aiNumericScore + queueGradeBoost(row.aiGrade);
    reasons.push(`Grade ${row.aiGrade}`);
  }

  const confidenceScore = resolveConfidenceScore(row);
  score += confidenceScore;
  if (confidenceScore >= 14) reasons.push("High confidence");

  if (input.queueAgeHours != null) {
    const ageScore = queueAgeBoost(input.queueAgeHours);
    score += ageScore;
    if (ageScore >= 10) reasons.push("Aging in queue");
  }

  if (input.positionUrgency) {
    const urgencyScore = positionUrgencyBoost(input.positionUrgency);
    score += urgencyScore;
    if (urgencyScore >= 10) reasons.push(`${input.positionUrgency} position urgency`);
  }

  const workloadCount = input.recruiterQueueCount ?? input.recruiterWorkload ?? 0;
  if (workloadCount > 0) {
    const workloadScore = recruiterWorkloadBoost(workloadCount);
    score += workloadScore;
    if (workloadScore >= 8) reasons.push("Recruiter queue bottleneck");
  }

  score += intelligenceSignalBoost(row);

  if (input.probabilityOfHire != null && input.probabilityOfHire > 0) {
    const hireBoost = Math.round(Math.min(12, input.probabilityOfHire * 12));
    score += hireBoost;
    if (hireBoost >= 8) reasons.push("High hire probability");
  }

  const actionOverdue =
    input.actionOverdue ??
  (input.actionDueDate ? isActionOverdue(input.actionDueDate, referenceMs) : false);

  if (actionOverdue) {
    score += 25;
    reasons.push("Action overdue");
  } else if (input.actionPriority === "high") {
    score += 12;
    reasons.push("High-priority action");
  } else if (input.actionPriority === "medium") {
    score += 6;
  }

  if (
    sla &&
    (sla.appliedAgingSeverity === "critical" ||
      sla.paperworkAgingSeverity === "critical" ||
      sla.recruiterInactivitySeverity === "critical" ||
      sla.followUpOverdue)
  ) {
    score += 15;
    reasons.push("SLA risk");
  }

  const uniqueReasons = [...new Set(reasons)].slice(0, 6);

  return {
    priorityScore: Math.round(score),
    priorityLevel: resolvePriorityLevel(
      score,
      COMMAND_CENTER_HIGH_PRIORITY_THRESHOLD,
      COMMAND_CENTER_MEDIUM_PRIORITY_THRESHOLD,
    ),
    priorityReasons: uniqueReasons.length > 0 ? uniqueReasons : ["Standard recruiter priority"],
  };
}

export { isPaperworkPendingStatus, isMelReadyStatus, isFollowUpOverdue };
