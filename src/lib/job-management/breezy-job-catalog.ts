import { fetchBreezyJobs, type BreezyJob } from "@/lib/breezy-api";
import { enrichCatalogRowsWithApplicantCounts } from "@/lib/job-management/job-applicant-counts";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import {
  JOB_MANAGEMENT_BREEZY_SOURCE,
  type BreezyJobCatalogRow,
  type BreezyJobCatalogSnapshot,
  type BreezyJobCatalogResult,
} from "@/lib/job-management/job-draft-types";

const CATALOG_CACHE_TTL_MS = 120_000;

type CatalogCacheEntry = {
  expiresAt: number;
  snapshot: BreezyJobCatalogSnapshot;
  includeDraft: boolean;
  lookupJobs: BreezyJob[];
};

let catalogCache: CatalogCacheEntry | null = null;

function buildCatalogSnapshot(
  lookupJobs: BreezyJob[],
  meta: Omit<
    BreezyJobCatalogSnapshot,
    | "ok"
    | "jobs"
    | "applicantCountsSource"
    | "applicantCountsFromCache"
    | "applicantCountsCachedAt"
    | "applicantCountsCandidatesConsidered"
  >,
): BreezyJobCatalogSnapshot {
  const mappedRows = lookupJobs.map(mapJobToCatalogRow);
  const applicantCounts = enrichCatalogRowsWithApplicantCounts(mappedRows, lookupJobs);
  return {
    ok: true,
    ...meta,
    jobs: applicantCounts.jobs,
    applicantCountsSource: applicantCounts.source,
    applicantCountsFromCache: applicantCounts.fromCache,
    applicantCountsCachedAt: applicantCounts.cachedAt,
    applicantCountsCandidatesConsidered: applicantCounts.candidatesConsidered,
  };
}

function snapshotFromCacheEntry(entry: CatalogCacheEntry, stale: boolean): BreezyJobCatalogSnapshot {
  return buildCatalogSnapshot(entry.lookupJobs, {
    ...entry.snapshot,
    fromCache: true,
    stale,
  });
}

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

function storeCatalogSnapshot(
  snapshot: BreezyJobCatalogSnapshot,
  includeDraft: boolean,
  lookupJobs: BreezyJob[],
): BreezyJobCatalogSnapshot {
  catalogCache = {
    expiresAt: Date.now() + CATALOG_CACHE_TTL_MS,
    snapshot,
    includeDraft,
    lookupJobs,
  };
  return snapshot;
}

/** Last in-memory catalog (even if TTL expired) for stale fallback on failed refresh. */
export function getStaleBreezyJobCatalogSnapshot(includeDraft: boolean): BreezyJobCatalogSnapshot | null {
  if (!catalogCache || catalogCache.includeDraft !== includeDraft) return null;
  return snapshotFromCacheEntry(catalogCache, true);
}

export async function fetchBreezyJobCatalog(options?: {
  force?: boolean;
  /** When true (default), merges published + draft Breezy positions for clone/post workflows. */
  includeDraft?: boolean;
}): Promise<BreezyJobCatalogResult> {
  const includeDraft = options?.includeDraft !== false;
  const now = Date.now();

  if (!options?.force && catalogCache && catalogCache.expiresAt > now && catalogCache.includeDraft === includeDraft) {
    return snapshotFromCacheEntry(catalogCache, false);
  }

  const publishedResult = await fetchBreezyJobs("published");
  if (!publishedResult.ok) {
    console.warn("[breezy-job-catalog] published fetch failed", { error: publishedResult.error });
    const stale = getStaleBreezyJobCatalogSnapshot(includeDraft);
    if (stale) {
      return {
        ...stale,
        refreshError: publishedResult.error,
        warnings: [`Latest refresh failed: ${publishedResult.error}`],
      };
    }
    return {
      ok: false,
      error: publishedResult.error,
      fetchedAt: publishedResult.fetchedAt,
      source: JOB_MANAGEMENT_BREEZY_SOURCE.label,
      sourcePath: JOB_MANAGEMENT_BREEZY_SOURCE.apiPath,
    };
  }

  let merged = [...publishedResult.jobs];
  let draftCount = 0;
  const warnings: string[] = [];
  let partial = false;

  if (includeDraft) {
    const draftResult = await fetchBreezyJobs("draft");
    if (draftResult.ok) {
      merged = dedupeJobsById([...merged, ...draftResult.jobs]);
      draftCount = draftResult.jobs.length;
    } else {
      partial = true;
      warnings.push(`Draft positions could not be loaded: ${draftResult.error}`);
      console.warn("[breezy-job-catalog] draft fetch failed — published catalog still returned", {
        error: draftResult.error,
      });
    }
  }

  const catalogJobs = filterCatalogJobs(merged, "all");
  const snapshot = buildCatalogSnapshot(catalogJobs, {
    fetchedAt: publishedResult.fetchedAt,
    fromCache: false,
    stale: false,
    partial: partial || undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    source: JOB_MANAGEMENT_BREEZY_SOURCE.label,
    sourcePath: JOB_MANAGEMENT_BREEZY_SOURCE.apiPath,
    companyId: publishedResult.companyId,
    companyName: publishedResult.companyName,
    publishedCount: publishedResult.jobs.length,
    draftCount,
  });

  return storeCatalogSnapshot(snapshot, includeDraft, catalogJobs);
}

/** Published-only catalog (overview compatibility). */
export async function fetchPublishedBreezyJobCatalog(options?: {
  force?: boolean;
}): Promise<BreezyJobCatalogResult> {
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
