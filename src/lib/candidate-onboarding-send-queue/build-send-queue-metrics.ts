import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { loadOnboardingSendQueueConfig } from "@/lib/candidate-onboarding-send-queue/send-queue-config-store";
import { loadOnboardingSendQueueWorkerState } from "@/lib/candidate-onboarding-send-queue/send-queue-state-store";
import type { OnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/types";

function countByStatus(
  records: CandidateOnboardingRecord[],
  status: CandidateOnboardingRecord["status"],
): number {
  return records.filter((row) => row.status === status).length;
}

export async function buildOnboardingSendQueueMetrics(
  referenceMs = Date.now(),
): Promise<OnboardingSendQueueMetrics> {
  const [config, worker, records] = await Promise.all([
    loadOnboardingSendQueueConfig(),
    loadOnboardingSendQueueWorkerState(),
    listAllCandidateOnboardingRecords(),
  ]);

  const pendingApproval = countByStatus(records, "pending_approval");
  const queued = countByStatus(records, "queued");
  const sending = countByStatus(records, "sending");
  const sent = countByStatus(records, "sent");
  const retryScheduled = countByStatus(records, "retry_scheduled");
  const failed = countByStatus(records, "failed");

  const remaining = queued + sending + retryScheduled + pendingApproval;
  const intervalMs = config.delayBetweenSendsMs + config.delayBetweenBatchesMs / config.batchSize;
  const estimatedCompletionMs =
    remaining > 0 ? Math.ceil(remaining * intervalMs) : null;

  let processingRatePerMinute: number | null = null;
  if (worker.lastSendCompletedAt && worker.sendsCompletedThisSession > 0) {
    const sessionStartMs = referenceMs - worker.sendsCompletedThisSession * intervalMs;
    const elapsedMs = Math.max(referenceMs - sessionStartMs, intervalMs);
    processingRatePerMinute = Math.round((worker.sendsCompletedThisSession / elapsedMs) * 60_000 * 10) / 10;
  }

  return {
    pendingApproval,
    queued,
    sending,
    sent,
    retryScheduled,
    failed,
    workerRunning: worker.running,
    sendsCompletedThisSession: worker.sendsCompletedThisSession,
    processingRatePerMinute,
    estimatedCompletionMs,
    config,
    lastTickAt: worker.lastTickAt,
  };
}
