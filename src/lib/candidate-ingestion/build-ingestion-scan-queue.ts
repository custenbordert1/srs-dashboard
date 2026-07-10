import type { BreezyJob } from "@/lib/breezy-api";
import { sortPublishedJobsForApplicantPriority } from "@/lib/breezy-api";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";

/**
 * P174 — Build the durable ingestion scan queue.
 * Unscanned positions first (newest-applicant priority), then already-scanned.
 */
export function buildIngestionPositionQueue(
  jobs: BreezyJob[],
  store: Pick<CandidateIngestionStoreFile, "scannedPositionIds">,
): string[] {
  const scannedSet = new Set(store.scannedPositionIds);
  const unscanned = sortPublishedJobsForApplicantPriority(
    jobs.filter((job) => job.jobId && !scannedSet.has(job.jobId)),
  );
  const scanned = jobs.filter((job) => job.jobId && scannedSet.has(job.jobId));
  return [...unscanned.map((j) => j.jobId), ...scanned.map((j) => j.jobId)];
}

/** Next chunk = highest-priority positions not yet scanned this cycle. */
export function selectNextIngestionScanChunk(input: {
  jobs: BreezyJob[];
  store: Pick<CandidateIngestionStoreFile, "scannedPositionIds">;
  chunkSize: number;
}): BreezyJob[] {
  const scannedSet = new Set(input.store.scannedPositionIds);
  const unscanned = sortPublishedJobsForApplicantPriority(
    input.jobs.filter((job) => job.jobId && !scannedSet.has(job.jobId)),
  );
  return unscanned.slice(0, Math.max(0, input.chunkSize));
}

export function countUnscannedPositions(
  jobs: BreezyJob[],
  store: Pick<CandidateIngestionStoreFile, "scannedPositionIds">,
): number {
  const scannedSet = new Set(store.scannedPositionIds);
  return jobs.filter((job) => job.jobId && !scannedSet.has(job.jobId)).length;
}
