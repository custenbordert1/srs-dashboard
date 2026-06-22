import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { calendarDaysSince } from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { stageAtOrBeyond } from "@/lib/pipeline-intelligence/territory-funnel";
import type { RecruiterPipelinePerformance } from "@/lib/pipeline-intelligence/types";
import {
  isActivePipelineCandidate,
  isBeyondStageSla,
  mapToCanonicalPipelineStage,
} from "@/lib/pipeline-intelligence/stage-mapping";

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

export function buildRecruiterPipelinePerformance(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): RecruiterPipelinePerformance[] {
  const byRecruiter = new Map<
    string,
    {
      assigned: number;
      reviewed: number;
      contacted: number;
      interviewsScheduled: number;
      paperworkSent: number;
      readyForMel: number;
      activeRep: number;
      responseDays: number[];
      waiting: number;
    }
  >();

  for (const row of candidates) {
    if (!isActivePipelineCandidate(row)) continue;
    const recruiter = row.assignedRecruiter.trim() || "Unassigned";
    const bucket = byRecruiter.get(recruiter) ?? {
      assigned: 0,
      reviewed: 0,
      contacted: 0,
      interviewsScheduled: 0,
      paperworkSent: 0,
      readyForMel: 0,
      activeRep: 0,
      responseDays: [],
      waiting: 0,
    };

    if (!isUnassignedRecruiter(recruiter)) bucket.assigned += 1;
    if (row.lastActionAt || row.history.length > 0) bucket.reviewed += 1;

    const stage = mapToCanonicalPipelineStage(row);
    if (stageAtOrBeyond(stage, "Contacted")) bucket.contacted += 1;
    if (stage === "Interview Scheduled") bucket.interviewsScheduled += 1;
    if (stageAtOrBeyond(stage, "Paperwork Sent")) bucket.paperworkSent += 1;
    if (stageAtOrBeyond(stage, "Ready for MEL")) bucket.readyForMel += 1;
    if (stage === "Active Rep") bucket.activeRep += 1;

    if (row.lastActionAt && row.appliedDate) {
      const response = calendarDaysSince(row.appliedDate, new Date(row.lastActionAt).getTime());
      if (response !== null) bucket.responseDays.push(response);
    }

    if (isBeyondStageSla(stage, row, referenceMs)) bucket.waiting += 1;

    byRecruiter.set(recruiter, bucket);
  }

  return [...byRecruiter.entries()]
    .map(([recruiter, bucket]) => ({
      recruiter,
      assigned: bucket.assigned,
      reviewed: bucket.reviewed,
      contacted: bucket.contacted,
      interviewsScheduled: bucket.interviewsScheduled,
      paperworkSent: bucket.paperworkSent,
      readyForMel: bucket.readyForMel,
      conversionPct:
        bucket.assigned > 0
          ? Math.round((bucket.activeRep / bucket.assigned) * 1000) / 10
          : 0,
      avgResponseDays: average(bucket.responseDays),
      candidatesWaiting: bucket.waiting,
    }))
    .sort(
      (a, b) =>
        b.candidatesWaiting - a.candidatesWaiting ||
        b.assigned - a.assigned ||
        a.recruiter.localeCompare(b.recruiter),
    );
}
