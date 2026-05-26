import type { BreezyCandidate, BreezyCandidatesScanMode, BreezyJob } from "@/lib/breezy-api";
import { peekBreezyCandidatesCache } from "@/lib/breezy-api";
import { buildJobsLookupMap } from "@/lib/breezy-global-candidates";
import type { BreezyJobCatalogRow } from "@/lib/job-management/job-draft-types";

export type JobApplicantCountsSource = "candidate_cache" | "breezy_list" | null;

export type EnrichCatalogApplicantCountsResult = {
  jobs: BreezyJobCatalogRow[];
  source: JobApplicantCountsSource;
  fromCache: boolean;
  cachedAt: string | null;
  candidatesConsidered: number;
};

const COUNT_SCAN_MODES: BreezyCandidatesScanMode[] = ["all", "fast", "preview"];

/** Prefer the richest in-memory candidate snapshot (no new Breezy scan). */
export function peekBestBreezyCandidatesSnapshotForCounts(state = "published") {
  let best: Extract<ReturnType<typeof peekBreezyCandidatesCache>, { ok: true }> | null = null;
  for (const scanMode of COUNT_SCAN_MODES) {
    const hit = peekBreezyCandidatesCache({ scanMode, state });
    if (!hit?.ok) continue;
    if (!best || hit.candidates.length > best.candidates.length) {
      best = hit;
    }
  }
  return best;
}

function candidateDedupeKey(candidate: BreezyCandidate): string {
  if (candidate.candidateId) return candidate.candidateId;
  return `${candidate.email}:${candidate.positionId}`;
}

/** Count unique applicants per canonical Breezy job id (jobId + friendlyId aliases). */
export function buildApplicantCountByBreezyJobId(
  candidates: BreezyCandidate[],
  jobs: BreezyJob[],
): Map<string, number> {
  const lookup = buildJobsLookupMap(jobs);
  const buckets = new Map<string, Set<string>>();

  for (const candidate of candidates) {
    const job = lookup.get(candidate.positionId);
    const jobId = job?.jobId;
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

export function enrichCatalogRowsWithApplicantCounts(
  rows: BreezyJobCatalogRow[],
  jobsForLookup: BreezyJob[],
): EnrichCatalogApplicantCountsResult {
  const cached = peekBestBreezyCandidatesSnapshotForCounts();
  if (cached) {
    const counts = buildApplicantCountByBreezyJobId(cached.candidates, jobsForLookup);
    const catalogJobIds = new Set(rows.map((row) => row.breezyJobId));
    const jobs = rows.map((row) => {
      if (!catalogJobIds.has(row.breezyJobId)) return row;
      return {
        ...row,
        applicantCount: counts.get(row.breezyJobId) ?? 0,
      };
    });
    return {
      jobs,
      source: "candidate_cache",
      fromCache: true,
      cachedAt: cached.fetchedAt,
      candidatesConsidered: cached.candidates.length,
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
