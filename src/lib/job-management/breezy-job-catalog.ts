import { fetchBreezyJobs, type BreezyJob } from "@/lib/breezy-api";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import type { BreezyJobCatalogRow, BreezyJobCatalogSnapshot } from "@/lib/job-management/job-draft-types";

const CATALOG_CACHE_TTL_MS = 120_000;
let catalogCache: { expiresAt: number; snapshot: BreezyJobCatalogSnapshot; includeDraft: boolean } | null =
  null;

function mapJobToCatalogRow(job: BreezyJob): BreezyJobCatalogRow {
  const pipelineStatus = job.status || "unknown";
  return {
    breezyJobId: job.jobId,
    title: job.name,
    city: job.city,
    usState: job.state,
    displayLocation: job.displayLocation,
    pipelineStatus,
    applicantCount: job.candidateCount ?? null,
    postedDate: job.createdDate || job.updatedDate,
    source: job.source ?? "Breezy",
    description: job.description,
    payRate: job.payRate,
    department: job.department,
  };
}

function filterCatalogJobs(jobs: BreezyJob[], pipeline: "published" | "draft" | "all"): BreezyJob[] {
  if (pipeline === "all") {
    return jobs.filter((job) => {
      const status = (job.status || "").toLowerCase();
      return status === "published" || status === "draft" || status === "unknown";
    });
  }
  return jobs.filter((job) => {
    const status = (job.status || "").toLowerCase();
    return status === pipeline || (pipeline === "published" && status === "unknown");
  });
}

function dedupeJobsById(jobs: BreezyJob[]): BreezyJob[] {
  const map = new Map<string, BreezyJob>();
  for (const job of jobs) {
    map.set(job.jobId, job);
  }
  return [...map.values()];
}

export async function fetchBreezyJobCatalog(options?: {
  force?: boolean;
  /** When true (default), merges published + draft Breezy positions for clone/post workflows. */
  includeDraft?: boolean;
}): Promise<BreezyJobCatalogSnapshot | { ok: false; error: string; fetchedAt: string }> {
  const includeDraft = options?.includeDraft !== false;
  const now = Date.now();
  if (!options?.force && catalogCache && catalogCache.expiresAt > now && catalogCache.includeDraft === includeDraft) {
    return { ...catalogCache.snapshot, fromCache: true };
  }

  const publishedResult = await fetchBreezyJobs("published");
  if (!publishedResult.ok) {
    console.warn("[breezy-job-catalog] published fetch failed", { error: publishedResult.error });
    return { ok: false, error: publishedResult.error, fetchedAt: publishedResult.fetchedAt };
  }

  let merged = [...publishedResult.jobs];
  let draftCount = 0;
  if (includeDraft) {
    const draftResult = await fetchBreezyJobs("draft");
    if (draftResult.ok) {
      merged = dedupeJobsById([...merged, ...draftResult.jobs]);
      draftCount = draftResult.jobs.length;
    } else {
      console.warn("[breezy-job-catalog] draft fetch failed — published catalog still returned", {
        error: draftResult.error,
      });
    }
  }

  const catalogJobs = filterCatalogJobs(merged, "all");
  const snapshot: BreezyJobCatalogSnapshot = {
    ok: true,
    jobs: catalogJobs.map(mapJobToCatalogRow),
    fetchedAt: publishedResult.fetchedAt,
    fromCache: false,
    companyId: publishedResult.companyId,
    companyName: publishedResult.companyName,
    publishedCount: publishedResult.jobs.length,
    draftCount,
  };

  catalogCache = {
    expiresAt: now + CATALOG_CACHE_TTL_MS,
    snapshot,
    includeDraft,
  };

  return snapshot;
}

/** Published-only catalog (overview compatibility). */
export async function fetchPublishedBreezyJobCatalog(options?: {
  force?: boolean;
}): Promise<BreezyJobCatalogSnapshot | { ok: false; error: string; fetchedAt: string }> {
  const result = await fetchBreezyJobCatalog({ ...options, includeDraft: false });
  if (!result.ok) return result;
  const published = result.jobs.filter(
    (job) => job.pipelineStatus === "published" || job.pipelineStatus === "unknown",
  );
  return { ...result, jobs: published };
}

export function jobCatalogRowToDraftInput(row: BreezyJobCatalogRow): {
  clonedFromBreezyJobId: string;
  title: string;
  description: string;
  city: string;
  usState: string;
  payRate: string;
  department: string;
  source: string;
  metadata: Record<string, string>;
} {
  const location = normalizeJobLocationFields(row.city, row.usState);

  return {
    clonedFromBreezyJobId: row.breezyJobId,
    title: `${row.title} (Draft)`.replace(/ \(Draft\) \(Draft\)/, " (Draft)"),
    description: row.description ?? "",
    city: location.city,
    usState: location.usState,
    payRate: row.payRate ?? "",
    department: row.department ?? "",
    source: row.source,
    metadata: {
      clonedFrom: row.breezyJobId,
      clonedAt: new Date().toISOString(),
      originalPostedDate: row.postedDate,
      originalPipelineStatus: row.pipelineStatus,
    },
  };
}
