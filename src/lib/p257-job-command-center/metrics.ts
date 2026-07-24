import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { CANDIDATE_WORKFLOW_STATUSES } from "@/lib/candidate-workflow-types";
import { distanceMilesForCandidateToJob } from "@/lib/recruiting-intelligence/travel-radius";
import type {
  JobCommandCenterApplicantInput,
  JobCommandCenterApplicantRow,
  JobCommandCenterMetrics,
  JobCommandCenterPipelineBucket,
} from "@/lib/p257-job-command-center/types";

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function countStatus(
  applicants: JobCommandCenterApplicantInput[],
  status: CandidateWorkflowStatus,
): number {
  return applicants.filter((row) => row.workflowStatus === status).length;
}

export function resolveApplicantDistanceMiles(
  applicant: JobCommandCenterApplicantInput,
  job: { city: string; state: string },
): number | null {
  if (typeof applicant.distanceMiles === "number" && Number.isFinite(applicant.distanceMiles)) {
    return applicant.distanceMiles;
  }
  return distanceMilesForCandidateToJob(
    applicant.zipCode ?? "",
    applicant.city ?? "",
    applicant.state ?? "",
    { city: job.city, state: job.state, zip: "" },
  );
}

/** Aggregate top-card metrics for a job's applicant set (read-only). */
export function buildJobCommandCenterMetrics(
  applicants: JobCommandCenterApplicantInput[],
  jobLocation: { city: string; state: string },
): JobCommandCenterMetrics {
  const distances: number[] = [];
  for (const applicant of applicants) {
    const miles = resolveApplicantDistanceMiles(applicant, jobLocation);
    if (miles != null && Number.isFinite(miles)) distances.push(miles);
  }

  return {
    applicants: applicants.length,
    qualified: countStatus(applicants, "Qualified"),
    paperworkNeeded: countStatus(applicants, "Paperwork Needed"),
    paperworkSent: countStatus(applicants, "Paperwork Sent"),
    signed: countStatus(applicants, "Signed"),
    readyForMel: countStatus(applicants, "Ready for MEL"),
    averageDistanceMiles: avg(distances),
    distanceSampleSize: distances.length,
  };
}

/** Full pipeline stage breakdown (stable status order). */
export function buildJobCommandCenterPipeline(
  applicants: JobCommandCenterApplicantInput[],
): JobCommandCenterPipelineBucket[] {
  const counts = new Map<CandidateWorkflowStatus, number>();
  for (const status of CANDIDATE_WORKFLOW_STATUSES) {
    counts.set(status, 0);
  }
  for (const applicant of applicants) {
    counts.set(applicant.workflowStatus, (counts.get(applicant.workflowStatus) ?? 0) + 1);
  }
  return CANDIDATE_WORKFLOW_STATUSES.map((status) => ({
    status,
    count: counts.get(status) ?? 0,
  })).filter((bucket) => bucket.count > 0);
}

export function buildJobCommandCenterApplicantRows(
  applicants: JobCommandCenterApplicantInput[],
  jobLocation: { city: string; state: string },
): JobCommandCenterApplicantRow[] {
  return applicants
    .map((applicant) => {
      const name = `${applicant.firstName ?? ""} ${applicant.lastName ?? ""}`.trim();
      return {
        candidateId: applicant.candidateId,
        displayName: name || applicant.email || applicant.candidateId,
        email: applicant.email ?? "",
        workflowStatus: applicant.workflowStatus,
        stage: applicant.stage ?? "",
        appliedDate: applicant.appliedDate ?? "",
        city: applicant.city ?? "",
        state: applicant.state ?? "",
        distanceMiles: resolveApplicantDistanceMiles(applicant, jobLocation),
      };
    })
    .sort((a, b) => {
      const aTime = a.appliedDate ? new Date(a.appliedDate).getTime() : 0;
      const bTime = b.appliedDate ? new Date(b.appliedDate).getTime() : 0;
      return bTime - aTime;
    });
}
