import { fetchBreezyJobs, type BreezyJob } from "@/lib/breezy-api";
import type { BreezyJobCatalogRow, BreezyJobCatalogSnapshot } from "@/lib/job-management/job-draft-types";

const CATALOG_CACHE_TTL_MS = 120_000;
let catalogCache: { expiresAt: number; snapshot: BreezyJobCatalogSnapshot } | null = null;

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

export async function fetchPublishedBreezyJobCatalog(options?: {
  force?: boolean;
}): Promise<BreezyJobCatalogSnapshot | { ok: false; error: string; fetchedAt: string }> {
  const now = Date.now();
  if (!options?.force && catalogCache && catalogCache.expiresAt > now) {
    return { ...catalogCache.snapshot, fromCache: true };
  }

  const result = await fetchBreezyJobs("published");
  if (!result.ok) {
    return { ok: false, error: result.error, fetchedAt: result.fetchedAt };
  }

  const published = result.jobs.filter(
    (job) => (job.status || "").toLowerCase() === "published" || job.status === "unknown",
  );

  const snapshot: BreezyJobCatalogSnapshot = {
    ok: true,
    jobs: published.map(mapJobToCatalogRow),
    fetchedAt: result.fetchedAt,
    fromCache: false,
    companyId: result.companyId,
    companyName: result.companyName,
  };

  catalogCache = {
    expiresAt: now + CATALOG_CACHE_TTL_MS,
    snapshot,
  };

  return snapshot;
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
  return {
    clonedFromBreezyJobId: row.breezyJobId,
    title: `${row.title} (Draft)`.replace(/ \(Draft\) \(Draft\)/, " (Draft)"),
    description: row.description ?? "",
    city: row.city,
    usState: row.usState,
    payRate: row.payRate ?? "",
    department: row.department ?? "",
    source: row.source,
    metadata: {
      clonedFrom: row.breezyJobId,
      clonedAt: new Date().toISOString(),
      originalPostedDate: row.postedDate,
    },
  };
}
