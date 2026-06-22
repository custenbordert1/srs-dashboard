import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  calendarDaysSince,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import type { EnhancedHiringForecast } from "@/lib/hiring-funnel-automation/types";

export function buildEnhancedHiringForecast(
  owned: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): EnhancedHiringForecast {
  const readyNow = owned.filter((row) => isMelReadyStatus(row.workflowStatus)).length;
  const signed = owned.filter((row) => row.workflowStatus === "Signed").length;
  const paperworkSent = owned.filter((row) => row.workflowStatus === "Paperwork Sent").length;
  const paperworkPending = owned.filter((row) => isPaperworkPendingStatus(row.workflowStatus)).length;
  const interview = owned.filter(
    (row) => row.recruitingActions.recommendInterview || row.workflowStatus === "Qualified",
  ).length;
  const early = owned.filter(
    (row) => row.workflowStatus === "Applied" || row.workflowStatus === "Needs Review",
  ).length;
  const hired = owned.filter(
    (row) => row.workflowStatus === "Active Rep" || row.workflowStatus === "Loaded in MEL",
  ).length;

  const gradeBoost = owned.filter(
    (row) => row.candidateGrade.grade === "A" || row.candidateGrade.grade === "B",
  ).length;
  const gradeFactor = Math.min(1.15, 1 + gradeBoost * 0.01);

  const readyForMel7d = Math.round((readyNow + signed * 0.85 + paperworkSent * 0.35) * gradeFactor);
  const readyForMel30d = Math.round(
    (readyForMel7d + interview * 0.4 + early * 0.08 + paperworkSent * 0.25) * gradeFactor,
  );
  const expectedHires30d = Math.round(hired + readyForMel30d * 0.6);

  const paperworkBottleneckCount = owned.filter((row) => {
    if (!isPaperworkPendingStatus(row.workflowStatus)) return false;
    const days = calendarDaysSince(row.lastActionAt ?? row.appliedDate, referenceMs);
    return days !== null && days >= 5;
  }).length;

  const interviewBottleneckCount = owned.filter((row) => {
    if (!row.recruitingActions.recommendInterview && row.workflowStatus !== "Qualified") return false;
    const days = calendarDaysSince(row.lastActionAt ?? row.appliedDate, referenceMs);
    return days !== null && days >= 3;
  }).length;

  return {
    readyForMel7d,
    readyForMel30d,
    expectedHires30d,
    paperworkBottleneckCount,
    interviewBottleneckCount,
    assumptions:
      "Based on owned pipeline counts, stage conversion rates, and grade-weighted readiness from current data.",
  };
}
