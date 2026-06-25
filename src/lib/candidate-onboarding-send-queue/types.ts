import type { OnboardingPacketStatus } from "@/lib/candidate-onboarding-engine/types";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

export type OnboardingSendQueueConfig = {
  maxConcurrentSends: number;
  batchSize: number;
  delayBetweenSendsMs: number;
  delayBetweenBatchesMs: number;
  maxRetries: number;
  /** Exponential backoff base delay (ms) — retry N uses base * 2^(N-1). */
  retryBackoffBaseMs: number;
  /** Reclaim items stuck in sending longer than this (ms). */
  sendingStaleMs: number;
  defaultTemplateKey: OnboardingTemplateKey;
  updatedAt: string;
};

export type OnboardingSendQueueWorkerState = {
  running: boolean;
  lastTickAt: string | null;
  lastSendCompletedAt: string | null;
  lastBatchCompletedAt: string | null;
  sendsCompletedThisSession: number;
  lastError: string | null;
  updatedAt: string;
};

export type OnboardingSendAttemptOutcome = "sent" | "retry_scheduled" | "failed" | "skipped";

export type OnboardingSendAttemptLog = {
  attemptId: string;
  candidateId: string;
  onboardingId: string;
  attemptNumber: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  httpStatus: number | null;
  dropboxResponse: string | null;
  retryScheduled: boolean;
  nextRetryAt: string | null;
  outcome: OnboardingSendAttemptOutcome;
  error: string | null;
};

export type OnboardingSendQueueMetrics = {
  pendingApproval: number;
  queued: number;
  sending: number;
  sent: number;
  retryScheduled: number;
  failed: number;
  workerRunning: boolean;
  sendsCompletedThisSession: number;
  processingRatePerMinute: number | null;
  estimatedCompletionMs: number | null;
  config: OnboardingSendQueueConfig;
  lastTickAt: string | null;
};

export const SEND_QUEUE_ACTIVE_STATUSES: OnboardingPacketStatus[] = [
  "pending_approval",
  "queued",
  "sending",
  "retry_scheduled",
];

export const SEND_QUEUE_PROCESSABLE_STATUSES: OnboardingPacketStatus[] = [
  "queued",
  "retry_scheduled",
];
