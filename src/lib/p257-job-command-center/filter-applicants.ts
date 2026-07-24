import {
  buildJobsLookupMap,
  type JobApplicantLookupCandidate,
  type JobApplicantLookupJob,
} from "@/lib/job-management/job-applicant-counts-core";

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function candidateDedupeKey(candidate: JobApplicantLookupCandidate): string {
  if (candidate.candidateId) return candidate.candidateId;
  return `${candidate.email}:${candidate.positionId}`;
}

/**
 * Filter candidates that belong to a Breezy job (same join rules as applicant counts:
 * positionId / friendlyId aliases / position name fallback).
 */
export function filterApplicantsForBreezyJob<T extends JobApplicantLookupCandidate>(
  candidates: T[],
  job: JobApplicantLookupJob,
): T[] {
  const jobs = [job];
  const lookup = buildJobsLookupMap(jobs);
  const jobIdByName = new Map<string, string>();
  if (job.name) {
    jobIdByName.set(normalizeName(job.name), job.jobId);
  }

  const seen = new Set<string>();
  const matched: T[] = [];

  for (const candidate of candidates) {
    let jobId = lookup.get(candidate.positionId)?.jobId;
    if (!jobId && candidate.positionName) {
      jobId = jobIdByName.get(normalizeName(candidate.positionName));
    }
    if (jobId !== job.jobId) continue;
    const key = candidateDedupeKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push(candidate);
  }

  return matched;
}
