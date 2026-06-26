import { computeRetryDelayMs } from "@/lib/candidate-onboarding-send-queue/classify-send-error";

export type PaperworkRetryPlan = {
  attemptNumber: number;
  maxAttempts: number;
  shouldRetry: boolean;
  nextRetryAt: string | null;
  delayMs: number | null;
  moveToFailedQueue: boolean;
  label: string;
};

export function buildPaperworkRetryPlan(input: {
  attemptNumber: number;
  maxAttempts: number;
  transient: boolean;
  baseBackoffMs: number;
  referenceMs?: number;
}): PaperworkRetryPlan {
  const referenceMs = input.referenceMs ?? Date.now();
  const withinLimit = input.attemptNumber < input.maxAttempts;

  if (!input.transient) {
    return {
      attemptNumber: input.attemptNumber,
      maxAttempts: input.maxAttempts,
      shouldRetry: false,
      nextRetryAt: null,
      delayMs: null,
      moveToFailedQueue: true,
      label: "Permanent failure — move to failed queue",
    };
  }

  if (!withinLimit) {
    return {
      attemptNumber: input.attemptNumber,
      maxAttempts: input.maxAttempts,
      shouldRetry: false,
      nextRetryAt: null,
      delayMs: null,
      moveToFailedQueue: true,
      label: `Exhausted ${input.maxAttempts} retries`,
    };
  }

  const delayMs = computeRetryDelayMs(input.attemptNumber + 1, input.baseBackoffMs);
  return {
    attemptNumber: input.attemptNumber,
    maxAttempts: input.maxAttempts,
    shouldRetry: true,
    nextRetryAt: new Date(referenceMs + delayMs).toISOString(),
    delayMs,
    moveToFailedQueue: false,
    label: `Retry ${input.attemptNumber + 1} scheduled`,
  };
}
