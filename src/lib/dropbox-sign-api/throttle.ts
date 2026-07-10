import {
  DROPBOX_BACKOFF_BASE_MS,
  DROPBOX_BACKOFF_MAX_MS,
  DROPBOX_MAX_RETRIES,
  getDropboxRequestsPerMinuteLimit,
} from "@/lib/dropbox-sign-api/constants";
import {
  recordDropboxRateLimitPause,
  recordDropboxRetry,
} from "@/lib/dropbox-sign-api/metrics";

const requestTimestamps: number[] = [];
let pausedUntilMs = 0;

function pruneWindow(now: number): void {
  const cutoff = now - 60_000;
  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseRateLimitHeaders(headers: Headers): {
  remaining: number | null;
  resetUnix: number | null;
  retryAfterSeconds: number | null;
} {
  const remainingRaw = headers.get("x-ratelimit-limit-remaining") ?? headers.get("X-Ratelimit-Limit-Remaining");
  const resetRaw = headers.get("x-ratelimit-reset") ?? headers.get("X-Ratelimit-Reset");
  const retryAfterRaw = headers.get("retry-after") ?? headers.get("Retry-After");

  const remaining = remainingRaw != null ? Number.parseInt(remainingRaw, 10) : null;
  const resetUnix = resetRaw != null ? Number.parseInt(resetRaw, 10) : null;
  const retryAfterSeconds = retryAfterRaw != null ? Number.parseInt(retryAfterRaw, 10) : null;

  return {
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetUnix: Number.isFinite(resetUnix) ? resetUnix : null,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
  };
}

export async function acquireDropboxRequestSlot(): Promise<void> {
  const limit = getDropboxRequestsPerMinuteLimit();
  for (;;) {
    const now = Date.now();
    if (now < pausedUntilMs) {
      const waitMs = pausedUntilMs - now;
      recordDropboxRateLimitPause(waitMs);
      await sleep(waitMs);
      continue;
    }

    pruneWindow(now);
    if (requestTimestamps.length < limit) {
      requestTimestamps.push(now);
      return;
    }

    const oldest = requestTimestamps[0] ?? now;
    const waitMs = Math.max(50, oldest + 60_000 - now + 25);
    recordDropboxRateLimitPause(waitMs);
    await sleep(waitMs);
  }
}

export function pauseDropboxRequestsUntil(untilMs: number): void {
  pausedUntilMs = Math.max(pausedUntilMs, untilMs);
}

export function computeRetryDelayMs(attempt: number, retryAfterSeconds: number | null): number {
  if (retryAfterSeconds != null && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  const exponent = Math.max(0, attempt - 1);
  return Math.min(DROPBOX_BACKOFF_MAX_MS, DROPBOX_BACKOFF_BASE_MS * 2 ** exponent);
}

export function getDropboxMaxRetries(): number {
  return DROPBOX_MAX_RETRIES;
}

export async function withDropboxRetry<T>(
  fn: (attempt: number) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DROPBOX_MAX_RETRIES; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const status =
        error && typeof error === "object" && "status" in error
          ? Number((error as { status?: number }).status)
          : undefined;
      const retryAfterSeconds =
        error && typeof error === "object" && "retryAfterSeconds" in error
          ? Number((error as { retryAfterSeconds?: number }).retryAfterSeconds)
          : null;

      const retryable =
        status === 429 || status === 502 || status === 503 || status === 504;
      if (!retryable || attempt >= DROPBOX_MAX_RETRIES) break;

      recordDropboxRetry();
      const delayMs = computeRetryDelayMs(attempt, retryAfterSeconds);
      pauseDropboxRequestsUntil(Date.now() + delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

/** Test-only reset. */
export function resetDropboxThrottleState(): void {
  requestTimestamps.length = 0;
  pausedUntilMs = 0;
}
