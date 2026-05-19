import type { CandidateWorkflowRecord, CandidateWorkflowState } from "@/lib/candidate-workflow-types";

export type RecruiterProductivityRow = {
  recruiter: string;
  candidatesReviewed: number;
  paperworkSent: number;
  avgResponseDays: number | null;
  workflowAgingDays: number | null;
  hires: number;
};

function daysBetween(startIso: string, endIso: string): number | null {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

function firstActionAt(record: CandidateWorkflowRecord): string | null {
  const oldest = record.history[record.history.length - 1];
  return oldest?.createdAt ?? record.lastActionAt;
}

export function buildRecruiterProductivity(workflows: CandidateWorkflowState): RecruiterProductivityRow[] {
  const byRecruiter = new Map<
    string,
    {
      reviewed: number;
      paperworkSent: number;
      responseDays: number[];
      agingDays: number[];
      hires: number;
    }
  >();

  for (const record of Object.values(workflows)) {
    const recruiter = record.assignedRecruiter.trim() || "Unassigned";
    const bucket = byRecruiter.get(recruiter) ?? {
      reviewed: 0,
      paperworkSent: 0,
      responseDays: [],
      agingDays: [],
      hires: 0,
    };

    if (record.history.length > 0 || record.lastActionAt) bucket.reviewed += 1;
    if (record.workflowStatus === "Paperwork Sent" || record.workflowStatus === "Signed") {
      bucket.paperworkSent += 1;
    }
    if (record.workflowStatus === "Active Rep") bucket.hires += 1;

    const firstAction = firstActionAt(record);
    if (firstAction && record.updatedAt) {
      const response = daysBetween(record.updatedAt, firstAction);
      if (response !== null) bucket.responseDays.push(response);
    }
    if (record.lastActionAt) {
      const aging = daysBetween(record.lastActionAt, new Date().toISOString());
      if (aging !== null) bucket.agingDays.push(aging);
    }

    byRecruiter.set(recruiter, bucket);
  }

  return [...byRecruiter.entries()]
    .map(([recruiter, bucket]) => ({
      recruiter,
      candidatesReviewed: bucket.reviewed,
      paperworkSent: bucket.paperworkSent,
      avgResponseDays:
        bucket.responseDays.length > 0
          ? Math.round(bucket.responseDays.reduce((sum, value) => sum + value, 0) / bucket.responseDays.length)
          : null,
      workflowAgingDays:
        bucket.agingDays.length > 0
          ? Math.round(bucket.agingDays.reduce((sum, value) => sum + value, 0) / bucket.agingDays.length)
          : null,
      hires: bucket.hires,
    }))
    .sort((a, b) => b.candidatesReviewed - a.candidatesReviewed || a.recruiter.localeCompare(b.recruiter));
}
