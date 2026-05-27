import type { BreezyJob } from "@/lib/breezy-api";
import { peekBreezyCandidatesCache } from "@/lib/breezy-api";
import {
  buildApplicantCountByBreezyJobId,
  type JobApplicantLookupCandidate,
} from "@/lib/job-management/job-applicant-counts-core";
import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";

export { buildApplicantCountByBreezyJobId } from "@/lib/job-management/job-applicant-counts-core";

export type JobApplicantCountsSource = "candidate_cache" | "breezy_list" | null;

export type EnrichCatalogApplicantCountsResult = {
  jobs: BreezyJobCatalogRow[];
  source: JobApplicantCountsSource;
  fromCache: boolean;
  cachedAt: string | null;
  candidatesConsidered: number;
};

/** Prefer the richest in-memory candidate snapshot (no new Breezy scan). */
export function peekBestBreezyCandidatesSnapshotForCounts(state = "published") {
  const hit = peekBreezyCandidatesCache({ state });
  return hit?.ok ? hit : null;
}

function toLookupCandidates(
  candidates: Array<{
    candidateId: string;
    email: string;
    positionId: string;
    positionName: string;
  }>,
): JobApplicantLookupCandidate[] {
  return candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    email: candidate.email,
    positionId: candidate.positionId,
    positionName: candidate.positionName,
  }));
}

function toLookupJobs(
  jobs: Array<{ jobId: string; friendlyId?: string; name?: string }>,
) {
  return jobs.map((job) => ({
    jobId: job.jobId,
    friendlyId: job.friendlyId,
    name: job.name,
  }));
}

export type JobApplicantCountsSnapshot = {
  ok: true;
  counts: Record<string, number>;
  source: JobApplicantCountsSource;
  fromCache: boolean;
  cachedAt: string | null;
  candidatesConsidered: number;
};

/** Peek server candidate cache and return per-job applicant totals (no new Breezy scan). */
export function buildJobApplicantCountsSnapshot(
  jobsForLookup: Array<{ jobId: string; friendlyId?: string; name?: string }>,
): JobApplicantCountsSnapshot {
  const cached = peekBestBreezyCandidatesSnapshotForCounts();
  if (!cached) {
    return {
      ok: true,
      counts: {},
      source: null,
      fromCache: false,
      cachedAt: null,
      candidatesConsidered: 0,
    };
  }

  const countsMap = buildApplicantCountByBreezyJobId(
    toLookupCandidates(cached.candidates),
    toLookupJobs(jobsForLookup),
  );
  const counts: Record<string, number> = {};
  for (const [jobId, count] of countsMap) {
    counts[jobId] = count;
  }

  return {
    ok: true,
    counts,
    source: "candidate_cache",
    fromCache: true,
    cachedAt: cached.fetchedAt,
    candidatesConsidered: cached.candidates.length,
  };
}

export function enrichCatalogRowsWithApplicantCounts(
  rows: BreezyJobCatalogRow[],
  jobsForLookup: BreezyJob[],
): EnrichCatalogApplicantCountsResult {
  const snapshot = buildJobApplicantCountsSnapshot(
    jobsForLookup.map((job) => ({
      jobId: job.jobId,
      friendlyId: job.friendlyId,
      name: job.name,
    })),
  );
  if (snapshot.source === "candidate_cache") {
    const catalogJobIds = new Set(rows.map((row) => row.breezyJobId));
    const jobs = rows.map((row) => {
      if (!catalogJobIds.has(row.breezyJobId)) return row;
      return {
        ...row,
        applicantCount: snapshot.counts[row.breezyJobId] ?? 0,
      };
    });
    return {
      jobs,
      source: snapshot.source,
      fromCache: snapshot.fromCache,
      cachedAt: snapshot.cachedAt,
      candidatesConsidered: snapshot.candidatesConsidered,
    };
  }

  const hasListCounts = rows.some((row) => typeof row.applicantCount === "number");
  return {
    jobs: rows,
    source: hasListCounts ? "breezy_list" : null,
    fromCache: false,
    cachedAt: null,
    candidatesConsidered: 0,
  };
}
