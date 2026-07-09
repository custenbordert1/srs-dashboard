import path from "node:path";

/**
 * True on Vercel and other read-only serverless runtimes where process.cwd()
 * points at a non-writable bundle directory (e.g. /var/task).
 */
export function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.VERCEL_ENV)
  );
}

/**
 * When true, JSON stores should keep state in process memory instead of the
 * local filesystem. Used for Vercel preview/production unless an explicit data
 * directory override is configured.
 */
export function useInMemoryPersistence(): boolean {
  if (!isServerlessRuntime()) return false;
  return !process.env.SRS_RECRUITING_DATA_DIR?.trim();
}

/**
 * Resolves the recruiting data directory for filesystem-backed stores.
 * Local development uses project .data; serverless uses /tmp (writable).
 */
export function resolveRecruitingDataDir(): string {
  const override = process.env.SRS_RECRUITING_DATA_DIR?.trim();
  if (override) return path.resolve(override);
  if (isServerlessRuntime()) {
    return path.join("/tmp", "srs-dashboard-data");
  }
  return path.join(process.cwd(), ".data");
}

/** Whether optional JSON persistence should write to the filesystem. */
export function canWriteRecruitingFilesystem(): boolean {
  return !useInMemoryPersistence();
}
