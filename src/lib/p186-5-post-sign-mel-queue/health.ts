import { readMissingDocsAgeThresholdMs } from "@/lib/p186-5-post-sign-mel-queue/flags";
import type { P1865MelQueueItem } from "@/lib/p186-5-post-sign-mel-queue/types";
import type { P1865QueueItem } from "@/lib/p186-5-post-sign-mel-queue/queues";
import type { P1865HealthMetrics } from "@/lib/p186-5-post-sign-mel-queue/types";
import type { P1865ReconcileFinding } from "@/lib/p186-5-post-sign-mel-queue/types";

export function buildPostSignHealthMetrics(input: {
  queueItems: P1865QueueItem[];
  melQueue: P1865MelQueueItem[];
  reconcileFindings?: P1865ReconcileFinding[];
  nowMs?: number;
}): P1865HealthMetrics {
  const now = input.nowMs ?? Date.now();
  const threshold = readMissingDocsAgeThresholdMs();

  const signedAwaiting = input.queueItems.filter(
    (i) => i.queueId === "signed_ready_onboarding_validation",
  );
  const missingDocs = input.queueItems.filter(
    (i) => i.queueId === "signed_missing_documents" && i.ageMs > threshold,
  );
  const ready = input.queueItems.filter((i) => i.queueId === "ready_for_mel_review");
  const blocked = input.queueItems.filter((i) => i.queueId === "mel_export_blocked");
  const readyAges = ready.map((i) => i.ageMs);
  const blockedAges = blocked.map((i) => i.ageMs);

  const byCandidate = new Map<string, number>();
  for (const q of input.melQueue) {
    if (["canceled", "failed", "confirmed_exported"].includes(q.status)) continue;
    byCandidate.set(q.candidateId, (byCandidate.get(q.candidateId) ?? 0) + 1);
  }

  return {
    signedAwaitingOnboardingReview: signedAwaiting.length,
    missingDocumentsOverThreshold: missingDocs.length,
    readyForMelAgingMs: {
      oldest: readyAges.length ? Math.max(...readyAges) : null,
      average: readyAges.length
        ? Math.round(readyAges.reduce((a, b) => a + b, 0) / readyAges.length)
        : null,
    },
    melExportBlockedAgingMs: {
      oldest: blockedAges.length ? Math.max(...blockedAges) : null,
      average: blockedAges.length
        ? Math.round(blockedAges.reduce((a, b) => a + b, 0) / blockedAges.length)
        : null,
    },
    duplicateQueueConflicts: [...byCandidate.values()].filter((n) => n > 1).length,
    signedNotInProduction: (input.reconcileFindings ?? []).filter(
      (f) => f.kind === "signed_but_production_paperwork_sent" || f.kind === "missing_production_transition",
    ).length,
    exportedUnconfirmed: input.melQueue.filter((q) => q.status === "exported_unverified").length,
    failedReconciliation: (input.reconcileFindings ?? []).filter(
      (f) => f.severity === "critical" || f.severity === "high",
    ).length,
    staleQueueItems: input.melQueue.filter((q) => {
      const age = now - Date.parse(q.updatedAt);
      return q.status === "pending_review" && age > 7 * 86400000;
    }).length,
  };
}
