import type { JobApplicantCountsSnapshot } from "@/lib/job-management/job-applicant-counts";

const EMPTY: JobApplicantCountsSnapshot = {
  ok: true,
  counts: {},
  source: null,
  fromCache: false,
  cachedAt: null,
  candidatesConsidered: 0,
};

export async function fetchJobManagementApplicantCounts(
  jobs: Array<{ jobId: string; title: string }>,
): Promise<JobApplicantCountsSnapshot> {
  const res = await fetch("/api/job-management/applicant-counts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      jobs: jobs.map((job) => ({ jobId: job.jobId, name: job.title })),
    }),
  });
  const parsed = (await res.json()) as JobApplicantCountsSnapshot | { ok: false; error?: string };
  if (!parsed.ok) return EMPTY;
  return parsed;
}
