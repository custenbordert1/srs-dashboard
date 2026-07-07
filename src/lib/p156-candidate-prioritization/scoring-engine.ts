import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";
import type { BreezyJob } from "@/lib/breezy-api";
import {
  buildCandidateSlaSnapshot,
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  P156_DAYS_UNTIL_START_THRESHOLDS,
  P156_OPEN_CALL_DEMAND_CAP,
  P156_PROJECT_URGENCY_SCORES,
} from "@/lib/p156-candidate-prioritization/constants";
import type {
  P156PriorityFactorId,
  P156ScoringContext,
} from "@/lib/p156-candidate-prioritization/types";
import { gradePriorityScore } from "@/lib/recruiter-priority/building-blocks";

type FactorResult = { subscore: number; explanation: string | null };

function scoreProjectUrgency(status: CoverageStatus): FactorResult {
  const subscore = P156_PROJECT_URGENCY_SCORES[status];
  if (status === "Critical") {
    return { subscore, explanation: "Critical project urgency in territory" };
  }
  if (status === "At Risk") {
    return { subscore, explanation: "At-risk project coverage" };
  }
  if (status === "Watch") {
    return { subscore, explanation: "Watch-level territory coverage" };
  }
  return { subscore, explanation: null };
}

function scoreDaysUntilProjectStart(days: number | null): FactorResult {
  if (days == null) {
    return { subscore: 25, explanation: null };
  }
  const tier = P156_DAYS_UNTIL_START_THRESHOLDS.find((row) => days <= row.maxDays);
  const subscore = tier?.score ?? 20;
  if (days <= 7) {
    return { subscore, explanation: `Project begins in ${days} day${days === 1 ? "" : "s"}` };
  }
  if (days <= 14) {
    return { subscore, explanation: `Project start within ${days} days` };
  }
  return { subscore, explanation: null };
}

function scoreOpenCallDemand(openCalls: number): FactorResult {
  const subscore = Math.min(100, Math.round((openCalls / P156_OPEN_CALL_DEMAND_CAP) * 100));
  if (openCalls >= 20) {
    return { subscore, explanation: `${openCalls} open calls nearby` };
  }
  if (openCalls >= 8) {
    return { subscore, explanation: `${openCalls} open calls in territory` };
  }
  return { subscore, explanation: null };
}

function scoreApplicationAge(row: ScoredCandidateWorkflowRow, referenceMs: number): FactorResult {
  const sla = buildCandidateSlaSnapshot({
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    lastActionAt: row.lastActionAt,
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    snoozedUntil: row.snoozedUntil,
    referenceMs,
  });
  const hours = hoursSince(row.appliedDate, referenceMs);
  const days = sla.appliedDays ?? (hours != null ? Math.floor(hours / 24) : 0);
  let subscore = 20;
  if (sla.appliedAgingSeverity === "critical") subscore = 95;
  else if (sla.appliedAgingSeverity === "warn") subscore = 72;
  else if (days >= 5) subscore = 55;
  else if (days >= 3) subscore = 40;

  if (days >= 5) {
    return { subscore, explanation: `Applied ${days} days ago — aging in pipeline` };
  }
  if (days >= 3) {
    return { subscore, explanation: `${days} days in pipeline` };
  }
  return { subscore, explanation: null };
}

function scoreDistanceToStores(distanceMiles: number | null, matchPercent: number): FactorResult {
  if (distanceMiles != null && distanceMiles >= 0) {
    const subscore =
      distanceMiles <= 15 ? 95 : distanceMiles <= 35 ? 75 : distanceMiles <= 60 ? 50 : 25;
    if (distanceMiles <= 25) {
      return { subscore, explanation: `Within ${Math.round(distanceMiles)} mi of open stores` };
    }
    return { subscore, explanation: null };
  }
  const subscore = Math.min(100, Math.round(matchPercent * 0.85));
  if (matchPercent >= 75) {
    return { subscore, explanation: "Strong territory fit" };
  }
  return { subscore, explanation: null };
}

function scoreCandidateStage(row: ScoredCandidateWorkflowRow): FactorResult {
  const status = row.workflowStatus;
  const stageScores: Record<string, number> = {
    "Paperwork Needed": 88,
    "Qualified": 82,
    "Interview": 78,
    "Paperwork Sent": 70,
    "Signed": 92,
    Applied: 45,
    "New Applicant": 40,
  };
  const subscore = stageScores[status] ?? 50;
  if (isMelReadyStatus(status)) {
    return { subscore: 98, explanation: "Ready for MEL load" };
  }
  if (status === "Paperwork Needed") {
    return { subscore, explanation: "Paperwork ready to send" };
  }
  if (status === "Qualified" || row.recruitingActions.recommendInterview) {
    return { subscore, explanation: "Interview-ready stage" };
  }
  if (isPaperworkPendingStatus(status)) {
    return { subscore, explanation: "Paperwork in progress" };
  }
  return { subscore, explanation: null };
}

function scoreRecruiterAssignment(
  row: ScoredCandidateWorkflowRow,
  coverageStatus: CoverageStatus,
): FactorResult {
  const assigned = !isUnassignedRecruiter(row.assignedRecruiter);
  if (assigned) {
    const subscore = coverageStatus === "Critical" || coverageStatus === "At Risk" ? 90 : 72;
    return { subscore, explanation: "Recruiter assigned" };
  }
  const subscore = coverageStatus === "Critical" ? 95 : coverageStatus === "At Risk" ? 82 : 58;
  return { subscore, explanation: "Awaiting recruiter assignment" };
}

function scorePreviousResponsiveness(row: ScoredCandidateWorkflowRow, referenceMs: number): FactorResult {
  let subscore = 35;
  const reasons: string[] = [];

  if (row.paperworkViewCount > 0 || row.paperworkViewedAt) {
    subscore += 28;
    reasons.push("Viewed paperwork");
  }
  if (row.paperworkSignedAt) {
    subscore += 35;
    reasons.push("Signed paperwork promptly");
  }
  if (
    isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs,
    })
  ) {
    subscore = Math.max(subscore, 80);
    reasons.push("Follow-up overdue — low responsiveness");
  } else if (row.recruitingActions.needsFollowUp) {
    subscore = Math.max(subscore, 55);
  }

  return {
    subscore: Math.min(100, subscore),
    explanation: reasons[0] ?? null,
  };
}

function scorePaperworkLikelihood(row: ScoredCandidateWorkflowRow): FactorResult {
  let subscore = 30;
  const reasons: string[] = [];

  if (row.candidateGrade?.paperworkReady) {
    subscore += 40;
    reasons.push("Paperwork ready");
  }
  if (row.questionnaireIntelligence?.techReady !== false) {
    subscore += 18;
  } else {
    subscore -= 12;
    reasons.push("Tech readiness gap");
  }
  if (row.resumeKeywordScore != null && row.resumeKeywordScore >= 60) {
    subscore += 12;
  }

  return {
    subscore: Math.min(100, Math.max(0, subscore)),
    explanation: reasons[0] ?? null,
  };
}

function scoreActiveCampaigns(hasActiveCampaign: boolean, job: BreezyJob | null): FactorResult {
  if (hasActiveCampaign && job?.status === "published") {
    return { subscore: 88, explanation: "Active hiring campaign for position" };
  }
  if (hasActiveCampaign) {
    return { subscore: 70, explanation: "Published job posting active" };
  }
  return { subscore: 22, explanation: null };
}

function scoreContinuityVsOneTime(isContinuity: boolean): FactorResult {
  if (isContinuity) {
    return { subscore: 85, explanation: "Continuity project — ongoing coverage need" };
  }
  return { subscore: 45, explanation: null };
}

function scoreTerritoryShortages(coverageNeedScore: number, coverageStatus: CoverageStatus): FactorResult {
  const subscore = Math.min(100, coverageNeedScore);
  if (coverageStatus === "Critical") {
    return { subscore, explanation: "High-demand territory" };
  }
  if (coverageNeedScore >= 70) {
    return { subscore, explanation: "Territory shortage signal" };
  }
  return { subscore, explanation: null };
}

function scoreCandidateQuality(row: ScoredCandidateWorkflowRow): FactorResult {
  const gradeScore = gradePriorityScore(row.aiGrade);
  const matchBoost = row.matchPercent > 0 ? Math.min(40, row.matchPercent * 0.4) : 0;
  const subscore = Math.min(100, gradeScore * 2.2 + matchBoost);
  if (row.isTopMatch || row.matchPercent >= 80) {
    return { subscore, explanation: "Top match / strong candidate history" };
  }
  if (gradeScore >= 20) {
    return { subscore, explanation: `Grade ${row.aiGrade}` };
  }
  return { subscore, explanation: null };
}

export function scoreCandidatePriorityFactors(input: {
  row: ScoredCandidateWorkflowRow;
  context: P156ScoringContext;
  job: BreezyJob | null;
}): Record<P156PriorityFactorId, FactorResult> {
  const { row, context, job } = input;

  return {
    projectUrgency: scoreProjectUrgency(context.coverageStatus),
    daysUntilProjectStart: scoreDaysUntilProjectStart(context.daysUntilProjectStart),
    openCallDemand: scoreOpenCallDemand(context.openDemand),
    applicationAge: scoreApplicationAge(row, context.referenceMs),
    distanceToOpenStores: scoreDistanceToStores(context.nearestDistanceMiles, row.matchPercent),
    candidateStage: scoreCandidateStage(row),
    recruiterAssignmentStatus: scoreRecruiterAssignment(row, context.coverageStatus),
    previousResponsiveness: scorePreviousResponsiveness(row, context.referenceMs),
    paperworkCompletionLikelihood: scorePaperworkLikelihood(row),
    activeHiringCampaigns: scoreActiveCampaigns(context.hasActiveCampaign, job),
    continuityVsOneTime: scoreContinuityVsOneTime(context.isContinuityProject),
    territoryShortages: scoreTerritoryShortages(context.coverageNeedScore, context.coverageStatus),
    candidateQuality: scoreCandidateQuality(row),
  };
}
