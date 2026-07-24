import type {
  P1865QueueId,
  P1865ReadinessClassification,
} from "@/lib/p186-5-post-sign-mel-queue/types";

export const P1865_QUEUE_LABELS: Record<P1865QueueId, string> = {
  signed_ready_onboarding_validation: "Signed and ready for onboarding validation",
  signed_missing_documents: "Signed but missing documents",
  signed_conflicting: "Signed and conflicting",
  ready_for_mel_review: "Ready for MEL review",
  mel_export_blocked: "MEL export blocked",
  already_exported: "Already exported",
  post_sign_reconciliation_exceptions: "Post-sign reconciliation exceptions",
};

export type P1865QueueItem = P1865ReadinessClassification & {
  displayName: string;
  jobOrProject: string | null;
  recruiter: string | null;
  dm: string | null;
  signedAt: string | null;
  ageMs: number;
};

export type P1865QueueSummary = {
  queueId: P1865QueueId;
  label: string;
  count: number;
  oldestAgeMs: number | null;
  averageAgeMs: number | null;
};

export function buildPostSignQueueItem(input: {
  classification: P1865ReadinessClassification;
  displayName?: string | null;
  jobOrProject?: string | null;
  recruiter?: string | null;
  dm?: string | null;
  nowMs?: number;
}): P1865QueueItem | null {
  if (!input.classification.queueId) return null;
  const signedAt = input.classification.sourceTimestamps.signedAt;
  const now = input.nowMs ?? Date.now();
  const signedMs = signedAt ? Date.parse(signedAt) : now;
  return {
    ...input.classification,
    displayName: input.displayName?.trim() || `Candidate ${input.classification.candidateId.slice(0, 8)}`,
    jobOrProject: input.jobOrProject ?? null,
    recruiter: input.recruiter ?? null,
    dm: input.dm ?? null,
    signedAt,
    ageMs: Math.max(0, now - (Number.isFinite(signedMs) ? signedMs : now)),
  };
}

export function summarizePostSignQueues(items: P1865QueueItem[]): P1865QueueSummary[] {
  const byQueue = new Map<P1865QueueId, P1865QueueItem[]>();
  for (const id of Object.keys(P1865_QUEUE_LABELS) as P1865QueueId[]) {
    byQueue.set(id, []);
  }
  for (const item of items) {
    if (item.queueId) byQueue.get(item.queueId)?.push(item);
  }
  return [...byQueue.entries()].map(([queueId, rows]) => {
    const ages = rows.map((r) => r.ageMs);
    return {
      queueId,
      label: P1865_QUEUE_LABELS[queueId],
      count: rows.length,
      oldestAgeMs: ages.length ? Math.max(...ages) : null,
      averageAgeMs: ages.length
        ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
        : null,
    };
  });
}
