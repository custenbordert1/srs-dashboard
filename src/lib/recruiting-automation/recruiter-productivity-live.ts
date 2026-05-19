import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { buildRecruiterProductivity, type RecruiterProductivityRow } from "@/lib/recruiter-productivity";
import { isHiredStage, isInterviewingStage, parseDate } from "@/lib/dm-dashboard/territory-shared";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RecruiterProductivityLiveRow = RecruiterProductivityRow & {
  interviewsScheduled: number;
  conversionPercent: number | null;
  responseSpeedLabel: string;
};

function matchRecruiterToCandidate(
  recruiter: string,
  candidate: BreezyCandidate,
  workflows: CandidateWorkflowState,
): boolean {
  const record = workflows[candidate.candidateId];
  if (record?.assignedRecruiter?.trim()) {
    return record.assignedRecruiter.trim() === recruiter;
  }
  return recruiter === "Unassigned";
}

export function buildRecruiterProductivityLive(
  candidates: BreezyCandidate[],
  workflows: CandidateWorkflowState,
  referenceIso: string,
): RecruiterProductivityLiveRow[] {
  const base = buildRecruiterProductivity(workflows);
  const reference = new Date(referenceIso);
  const since30d = new Date(reference.getTime() - 30 * MS_PER_DAY);

  const breezyByRecruiter = new Map<
    string,
    { interviewed: number; hired: number; recent: number; responseDays: number[] }
  >();

  for (const candidate of candidates) {
    const record = workflows[candidate.candidateId];
    const recruiter = record?.assignedRecruiter?.trim() || "Unassigned";
    const bucket = breezyByRecruiter.get(recruiter) ?? {
      interviewed: 0,
      hired: 0,
      recent: 0,
      responseDays: [],
    };

    if (isInterviewingStage(candidate.stage)) bucket.interviewed += 1;
    if (isHiredStage(candidate.stage)) bucket.hired += 1;

    const applied = parseDate(candidate.appliedDate);
    if (applied && applied >= since30d) bucket.recent += 1;
    if (applied) {
      bucket.responseDays.push(
        Math.max(0, Math.round((reference.getTime() - applied.getTime()) / MS_PER_DAY)),
      );
    }
    breezyByRecruiter.set(recruiter, bucket);
  }

  const recruiters = new Set([
    ...base.map((row) => row.recruiter),
    ...breezyByRecruiter.keys(),
  ]);

  return [...recruiters]
    .map((recruiter) => {
      const workflowRow = base.find((row) => row.recruiter === recruiter);
      const breezy = breezyByRecruiter.get(recruiter);
      const reviewed =
        workflowRow?.candidatesReviewed ??
        candidates.filter((c) => matchRecruiterToCandidate(recruiter, c, workflows)).length;
      const interviewsScheduled = breezy?.interviewed ?? 0;
      const hires = Math.max(workflowRow?.hires ?? 0, breezy?.hired ?? 0);
      const conversionPercent =
        reviewed > 0 ? Math.round((hires / reviewed) * 100) : interviewsScheduled > 0 ? 0 : null;

      const avgResponse =
        breezy && breezy.responseDays.length > 0
          ? Math.round(
              breezy.responseDays.reduce((sum, value) => sum + value, 0) / breezy.responseDays.length,
            )
          : workflowRow?.avgResponseDays;

      let responseSpeedLabel = "—";
      if (avgResponse !== null && avgResponse !== undefined) {
        if (avgResponse <= 2) responseSpeedLabel = "Fast";
        else if (avgResponse <= 5) responseSpeedLabel = "Moderate";
        else responseSpeedLabel = "Slow";
      }

      return {
        recruiter,
        candidatesReviewed: reviewed,
        paperworkSent: workflowRow?.paperworkSent ?? 0,
        avgResponseDays: avgResponse ?? workflowRow?.avgResponseDays ?? null,
        workflowAgingDays: workflowRow?.workflowAgingDays ?? null,
        hires,
        interviewsScheduled,
        conversionPercent,
        responseSpeedLabel,
      };
    })
    .sort((a, b) => b.candidatesReviewed - a.candidatesReviewed || a.recruiter.localeCompare(b.recruiter));
}
