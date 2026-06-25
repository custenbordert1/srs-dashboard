import { DropboxSignError } from "@/lib/dropbox-sign";

const RATE_LIMIT_PATTERNS = [
  /rate limit/i,
  /too many requests/i,
  /transaction rate exceeded/i,
  /system limits for test requests/i,
];

export function isTransientSendError(input: {
  error: unknown;
  httpStatus?: number | null;
  message?: string;
}): boolean {
  const message =
    input.message ??
    (input.error instanceof Error ? input.error.message : String(input.error ?? ""));

  if (input.error instanceof DropboxSignError) {
    if (input.error.code === "timeout" || input.error.code === "network_error") return true;
    const status = input.error.status ?? input.httpStatus;
    if (status === 429) return true;
    if (status != null && status >= 500) return true;
    if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message))) return true;
    return false;
  }

  const status = input.httpStatus;
  if (status === 429) return true;
  if (status != null && status >= 500) return true;
  if (RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message))) return true;

  if (input.error instanceof Error && input.error.name === "AbortError") return true;

  return false;
}

export function resolveSendHttpStatus(error: unknown): number | null {
  if (error instanceof DropboxSignError && error.status != null) return error.status;
  return null;
}

export function resolveSendErrorMessage(error: unknown): string {
  if (error instanceof DropboxSignError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function computeRetryDelayMs(attemptNumber: number, baseMs: number): number {
  const exponent = Math.max(0, attemptNumber - 1);
  return baseMs * 2 ** exponent;
}
