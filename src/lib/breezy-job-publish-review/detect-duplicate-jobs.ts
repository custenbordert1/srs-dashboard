import type { BreezyJob } from "@/lib/breezy-api";

export function normalizeJobText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function jobFingerprint(job: Pick<BreezyJob, "name" | "city" | "state">): string {
  return `${normalizeJobText(job.name)}|${normalizeJobText(job.state)}|${normalizeJobText(job.city)}`;
}

export function isPublishedStatus(status: string): boolean {
  return normalizeJobText(status) === "published";
}

export function parseJobDate(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export type DuplicateJobIndex = {
  byFingerprint: Map<string, BreezyJob[]>;
  publishedByFingerprint: Map<string, BreezyJob[]>;
  byJobId: Map<string, BreezyJob>;
};

export function buildDuplicateJobIndex(jobs: BreezyJob[]): DuplicateJobIndex {
  const byFingerprint = new Map<string, BreezyJob[]>();
  const publishedByFingerprint = new Map<string, BreezyJob[]>();
  const byJobId = new Map<string, BreezyJob>();

  for (const job of jobs) {
    byJobId.set(job.jobId, job);
    const fp = jobFingerprint(job);
    const bucket = byFingerprint.get(fp) ?? [];
    bucket.push(job);
    byFingerprint.set(fp, bucket);
    if (isPublishedStatus(job.status)) {
      const published = publishedByFingerprint.get(fp) ?? [];
      published.push(job);
      publishedByFingerprint.set(fp, published);
    }
  }

  for (const [fp, list] of byFingerprint) {
    list.sort((a, b) => parseJobDate(b.updatedDate) - parseJobDate(a.updatedDate));
    byFingerprint.set(fp, list);
  }
  for (const [fp, list] of publishedByFingerprint) {
    list.sort((a, b) => parseJobDate(b.updatedDate) - parseJobDate(a.updatedDate));
    publishedByFingerprint.set(fp, list);
  }

  return { byFingerprint, publishedByFingerprint, byJobId };
}

export function findDuplicateFindings(index: DuplicateJobIndex): Array<{
  fingerprint: string;
  activeJobId: string;
  activeJobTitle: string;
  activeJobStatus: string;
  duplicateJobIds: string[];
  recommendedKeepActiveJobId: string;
  reason: string;
}> {
  const findings: Array<{
    fingerprint: string;
    activeJobId: string;
    activeJobTitle: string;
    activeJobStatus: string;
    duplicateJobIds: string[];
    recommendedKeepActiveJobId: string;
    reason: string;
  }> = [];

  for (const [, published] of index.publishedByFingerprint) {
    if (published.length <= 1) continue;
    const [newest, ...older] = published;
    findings.push({
      fingerprint: jobFingerprint(newest),
      activeJobId: newest.jobId,
      activeJobTitle: newest.name,
      activeJobStatus: newest.status,
      duplicateJobIds: older.map((j) => j.jobId),
      recommendedKeepActiveJobId: newest.jobId,
      reason: `Multiple published ads for same title/location — keep newest (${newest.jobId}), retire older duplicates.`,
    });
  }

  return findings;
}

export function findActivePublishedDuplicate(
  index: DuplicateJobIndex,
  job: Pick<BreezyJob, "jobId" | "name" | "city" | "state">,
): BreezyJob | null {
  const published = index.publishedByFingerprint.get(jobFingerprint(job)) ?? [];
  return published.find((entry) => entry.jobId !== job.jobId) ?? null;
}
