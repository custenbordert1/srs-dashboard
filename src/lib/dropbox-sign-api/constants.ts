/** Default stays below Dropbox Sign standard limit (100/min). */
export const DEFAULT_DROPBOX_REQUESTS_PER_MINUTE = 90;

/** Default per-cycle GET budget for post-send monitor reconciliation. */
export const DEFAULT_DROPBOX_MONITOR_BUDGET_PER_CYCLE = 25;

export const DROPBOX_CACHE_TTL_AWAITING_MS = 5 * 60 * 1000;
export const DROPBOX_CACHE_TTL_VIEWED_MS = 2 * 60 * 1000;
export const DROPBOX_CACHE_TTL_SIGNED_MS = 24 * 60 * 60 * 1000;

export const DROPBOX_MAX_RETRIES = 3;
export const DROPBOX_BACKOFF_BASE_MS = 1_000;
export const DROPBOX_BACKOFF_MAX_MS = 60_000;

export function getDropboxRequestsPerMinuteLimit(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.DROPBOX_SIGN_REQUESTS_PER_MINUTE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DROPBOX_REQUESTS_PER_MINUTE;
}

export function getDropboxMonitorBudgetPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.DROPBOX_SIGN_MONITOR_BUDGET_PER_CYCLE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DROPBOX_MONITOR_BUDGET_PER_CYCLE;
}
