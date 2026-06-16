import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  calendarDaysSince,
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { CandidatePriorityBand } from "@/lib/recruiter-action-center/types";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

function territoryDemandScore(opportunities: MelOpportunity[], state: string): number {
  const code = normalizeStateCode(state);
  const openCalls = opportunities.filter(
    (opp) => opp.openStatus && !opp.isStaffed && normalizeStateCode(opp.state) === code,
  ).length;
  return Math.min(100, openCalls * 12);
}

function projectUrgencyScore(row: ScoredCandidateWorkflowRow, opportunities: MelOpportunity[]): number {
  const code = normalizeStateCode(row.state);
  const urgent = opportunities.filter(
    (opp) =>
      opp.openStatus &&
      !opp.isStaffed &&
      normalizeStateCode(opp.state) === code &&
      (opp.priority === "high" || opp.priority === "medium"),
  ).length;
  return Math.min(100, urgent * 18);
}

function responsivenessScore(row: ScoredCandidateWorkflowRow, referenceMs: number): number {
  const touchHours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs);
  if (touchHours === null) return 20;
  if (touchHours <= 24) return 90;
  if (touchHours <= 48) return 65;
  if (touchHours <= 72) return 40;
  return 15;
}

function coverageImpactScore(row: ScoredCandidateWorkflowRow): number {
  const match = row.matchPercent ?? 0;
  const ai = row.aiNumericScore ?? 0;
  return Math.min(100, Math.round(match * 0.55 + ai * 0.45));
}

function stageScore(status: string): number {
  switch (status) {
    case "Ready for MEL":
      return 95;
    case "Signed":
      return 90;
    case "Paperwork Sent":
      return 75;
    case "Paperwork Needed":
      return 70;
    case "Qualified":
      return 65;
    case "Training Needed":
      return 55;
    case "Applied":
    case "Needs Review":
      return 45;
    default:
      return 35;
  }
}

export function resolvePriorityBand(score: number): CandidatePriorityBand {
  if (score >= 90) return "work-immediately";
  if (score >= 70) return "high";
  if (score >= 50) return "normal";
  return "monitor";
}

export function priorityBandLabel(band: CandidatePriorityBand): string {
  switch (band) {
    case "work-immediately":
      return "Work immediately";
    case "high":
      return "High";
    case "normal":
      return "Normal";
    case "monitor":
      return "Monitor";
  }
}

export function scoreRecruiterActionCenterPriority(input: {
  row: ScoredCandidateWorkflowRow;
  opportunities: MelOpportunity[];
  referenceMs: number;
}): number {
  const { row, opportunities, referenceMs } = input;
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return 0;

  const appliedDays = calendarDaysSince(row.appliedDate, referenceMs) ?? 0;
  const followUpDue = isFollowUpOverdue({
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    referenceMs,
  });

  const stage = stageScore(row.workflowStatus);
  const applicationAge = Math.max(0, 25 - Math.min(appliedDays, 14) * 1.5);
  const followUp = followUpDue ? 20 : row.recruitingActions.needsFollowUp ? 12 : 0;
  const paperwork =
    isPaperworkPendingStatus(row.workflowStatus) || row.workflowStatus === "Paperwork Sent" ? 14 : 0;
  const melReady = isMelReadyStatus(row.workflowStatus) ? 18 : 0;
  const interview = row.recruitingActions.recommendInterview || row.workflowStatus === "Qualified" ? 10 : 0;
  const territory = territoryDemandScore(opportunities, row.state) * 0.12;
  const urgency = projectUrgencyScore(row, opportunities) * 0.1;
  const responsiveness = responsivenessScore(row, referenceMs) * 0.08;
  const coverage = coverageImpactScore(row) * 0.1;
  const unassignedBoost = isUnassignedRecruiter(row.assignedRecruiter) ? 8 : 0;
  const priorityBoost = row.recruitingActions.priorityList ? 12 : 0;

  return Math.round(
    Math.min(
      100,
      stage * 0.28 +
        applicationAge +
        followUp +
        paperwork +
        melReady +
        interview +
        territory +
        urgency +
        responsiveness +
        coverage +
        unassignedBoost +
        priorityBoost,
    ),
  );
}
