import {
  JOB_MANAGEMENT_BREEZY_SOURCE,
  type BreezyJobCatalogResult,
} from "@/lib/job-management/job-draft-types";

/** Job Management catalog refresh — longer than dashboard-wide Breezy reads. */
export const JOB_MANAGEMENT_CATALOG_TIMEOUT_MS = 30_000;

export type JobManagementCatalogFetchResult = BreezyJobCatalogResult & {
  httpStatus?: number;
};

function catalogFailure(message: string, httpStatus?: number): JobManagementCatalogFetchResult {
  return {
    ok: false,
    error: message,
    fetchedAt: new Date().toISOString(),
    source: JOB_MANAGEMENT_BREEZY_SOURCE.label,
    sourcePath: JOB_MANAGEMENT_BREEZY_SOURCE.apiPath,
    httpStatus,
  };
}

export async function fetchJobManagementCatalog(options?: {
  force?: boolean;
}): Promise<JobManagementCatalogFetchResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JOB_MANAGEMENT_CATALOG_TIMEOUT_MS);

  try {
    const query = options?.force ? "?force=true" : "";
    const res = await fetch(`${JOB_MANAGEMENT_BREEZY_SOURCE.apiPath}${query}`, {
      cache: "no-store",
      signal: controller.signal,
    });

    const parsed = (await res.json()) as BreezyJobCatalogResult;
    if (parsed.ok) {
      return parsed;
    }
    if (!parsed.ok) {
      return { ...parsed, httpStatus: res.status };
    }
    return catalogFailure("Unexpected catalog response.", res.status);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return catalogFailure(
        `Breezy job sync timed out after ${JOB_MANAGEMENT_CATALOG_TIMEOUT_MS / 1000}s. Try Refresh again.`,
      );
    }
    return catalogFailure(err instanceof Error ? err.message : "Failed to load Breezy jobs.");
  } finally {
    clearTimeout(timeoutId);
  }
}
