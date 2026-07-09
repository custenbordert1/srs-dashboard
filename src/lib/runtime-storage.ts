import path from "node:path";

const SERVERLESS_TMP_DATA_DIR = path.join("/tmp", "srs-dashboard-data");

function isBundleRoot(cwd: string): boolean {
  return cwd === "/var/task" || cwd.startsWith("/var/task/");
}

/**
 * True on Vercel and other read-only serverless runtimes where process.cwd()
 * points at a non-writable bundle directory (e.g. /var/task).
 */
export function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.VERCEL_ENV) ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.LAMBDA_TASK_ROOT) ||
    Boolean(process.env.NOW_REGION) ||
    isBundleRoot(process.cwd())
  );
}

function recruitingDataOverride(): string | null {
  const override = process.env.SRS_RECRUITING_DATA_DIR?.trim();
  return override || null;
}

function isWritableServerlessOverride(override: string): boolean {
  const resolved = path.resolve(override);
  if (isBundleRoot(resolved) || resolved.includes("/var/task/.data")) return false;
  if (!path.isAbsolute(override)) return false;
  return resolved.startsWith("/tmp/") || resolved.startsWith("/mnt/");
}

/**
 * When true, JSON stores should keep state in process memory instead of the
 * local filesystem. Used for Vercel preview/production unless a writable
 * absolute data directory override is configured.
 */
export function useInMemoryPersistence(): boolean {
  if (!isServerlessRuntime()) return false;
  const override = recruitingDataOverride();
  if (!override) return true;
  return !isWritableServerlessOverride(override);
}

/**
 * Resolves the recruiting data directory for filesystem-backed stores.
 * Local development uses project .data; serverless uses /tmp (writable).
 */
export function resolveRecruitingDataDir(): string {
  const override = recruitingDataOverride();
  if (override) {
    if (isServerlessRuntime()) {
      if (isWritableServerlessOverride(override)) return path.resolve(override);
      return SERVERLESS_TMP_DATA_DIR;
    }
    return path.resolve(override);
  }
  if (isServerlessRuntime()) return SERVERLESS_TMP_DATA_DIR;
  return path.join(process.cwd(), ".data");
}

/** Whether optional JSON persistence should write to the filesystem. */
export function canWriteRecruitingFilesystem(): boolean {
  return !useInMemoryPersistence();
}

/** Never mkdir under /var/task/.data — no-op when persistence is disabled. */
export function isUnsafeDataDir(target: string): boolean {
  const resolved = path.resolve(target);
  return isBundleRoot(resolved) || resolved.includes("/var/task/.data");
}
