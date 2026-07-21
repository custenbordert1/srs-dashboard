import { createHash, randomUUID } from "node:crypto";
import {
  nextRetryDelayMs,
  shouldRetryPaperworkSend,
} from "@/lib/autonomous-paperwork-orchestrator/retry-engine";
import type { Decision, PaperworkTask } from "@/lib/candidate-evaluation-orchestrator/types";

export function buildPaperworkIdempotencyKey(candidateId: string, kind: string): string {
  return createHash("sha256").update(`ceo-pw:${candidateId}:${kind}`).digest("hex").slice(0, 24);
}

/**
 * Plan paperwork tasks for auto_advance only.
 * Execution remains in P123 / P184 — this never sends.
 */
export function planPaperworkTasks(decision: Decision): PaperworkTask[] {
  if (decision.outcome !== "auto_advance") return [];
  const now = new Date().toISOString();
  return [
    {
      taskId: randomUUID(),
      candidateId: decision.candidateId,
      kind: "onboarding_packet",
      status: "ready",
      idempotencyKey: buildPaperworkIdempotencyKey(decision.candidateId, "onboarding_packet"),
      templateKey: "onboarding_packet",
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
      nextRetryAt: null,
      decisionId: decision.decisionId,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/** Reuse P123 retry policy for planned tasks. */
export function schedulePaperworkRetry(task: PaperworkTask, error: string): PaperworkTask {
  const attempt = task.attempts + 1;
  const retry = shouldRetryPaperworkSend({
    error,
    eligibilityStatus: "ELIGIBLE",
    attempt,
    maxAttempts: task.maxAttempts,
  });
  const now = new Date();
  if (!retry) {
    return {
      ...task,
      attempts: attempt,
      status: "failed",
      lastError: error,
      nextRetryAt: null,
      updatedAt: now.toISOString(),
    };
  }
  return {
    ...task,
    attempts: attempt,
    status: "pending",
    lastError: error,
    nextRetryAt: new Date(now.getTime() + nextRetryDelayMs(attempt - 1)).toISOString(),
    updatedAt: now.toISOString(),
  };
}
