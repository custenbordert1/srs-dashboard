const RETRYABLE_PATTERNS = [/timed out/i, /timeout/i, /network/i, /econnreset/i, /dropbox.*temporary/i, /503/, /502/, /429/];

const NEVER_RETRY_PATTERNS = [
  /duplicate/i,
  /already sent/i,
  /already_signed/i,
  /invalid email/i,
  /manual rejection/i,
  /idempotent skip/i,
];

export const RETRY_BACKOFF_MS = [5_000, 15_000, 45_000];

export function isRetryablePaperworkError(error: string | null | undefined): boolean {
  if (!error?.trim()) return false;
  if (NEVER_RETRY_PATTERNS.some((pattern) => pattern.test(error))) return false;
  return RETRYABLE_PATTERNS.some((pattern) => pattern.test(error));
}

export function nextRetryDelayMs(attempt: number): number {
  const index = Math.max(0, Math.min(attempt, RETRY_BACKOFF_MS.length - 1));
  return RETRY_BACKOFF_MS[index] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!;
}

export function shouldRetryPaperworkSend(input: {
  error: string | null | undefined;
  eligibilityStatus: string;
  attempt: number;
  maxAttempts?: number;
}): boolean {
  if (input.attempt >= (input.maxAttempts ?? RETRY_BACKOFF_MS.length)) return false;
  if (["DUPLICATE", "ALREADY_SENT", "INVALID_EMAIL", "BLOCKED"].includes(input.eligibilityStatus)) {
    return false;
  }
  return isRetryablePaperworkError(input.error);
}
