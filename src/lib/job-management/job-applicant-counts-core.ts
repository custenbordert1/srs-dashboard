/** Client-safe applicant counting (no server Breezy imports). */

export type JobApplicantLookupJob = {
  jobId: string;
  friendlyId?: string;
  name?: string;
};

export type JobApplicantLookupCandidate = {
  candidateId: string;
  email: string;
  positionId: string;
  positionName?: string;
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildJobsLookupMap(jobs: JobApplicantLookupJob[]): Map<string, JobApplicantLookupJob> {
  const map = new Map<string, JobApplicantLookupJob>();
  for (const job of jobs) {
    map.set(job.jobId, job);
    if (job.friendlyId && job.friendlyId !== job.jobId) {
      map.set(job.friendlyId, job);
    }
  }
  return map;
}

function candidateDedupeKey(candidate: JobApplicantLookupCandidate): string {
  if (candidate.candidateId) return candidate.candidateId;
  return `${candidate.email}:${candidate.positionId}`;
}

/** Count unique applicants per canonical Breezy job id (jobId + friendlyId aliases). */
export function buildApplicantCountByBreezyJobId(
  candidates: JobApplicantLookupCandidate[],
  jobs: JobApplicantLookupJob[],
): Map<string, number> {
  const lookup = buildJobsLookupMap(jobs);
  const jobIdByName = new Map<string, string>();
  for (const job of jobs) {
    if (!job.name) continue;
    jobIdByName.set(normalizeName(job.name), job.jobId);
  }

  const buckets = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    let jobId = lookup.get(candidate.positionId)?.jobId;
    if (!jobId && candidate.positionName) {
      jobId = jobIdByName.get(normalizeName(candidate.positionName));
    }
    if (!jobId) continue;
    const bucket = buckets.get(jobId) ?? new Set<string>();
    bucket.add(candidateDedupeKey(candidate));
    buckets.set(jobId, bucket);
  }

  const counts = new Map<string, number>();
  for (const [jobId, ids] of buckets) {
    counts.set(jobId, ids.size);
  }
  return counts;
}
