import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  getOnboardingRecordById,
  listAllCandidateOnboardingRecords,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { candidatePrimaryEmail } from "@/lib/onboarding-signer";
import {
  computeRetryDelayMs,
  resolveSendHttpStatus,
} from "@/lib/candidate-onboarding-send-queue/classify-send-error";
import { buildOnboardingSendQueueMetrics } from "@/lib/candidate-onboarding-send-queue/build-send-queue-metrics";
import {
  executeOnboardingSend,
  type ExecuteOnboardingSendDeps,
} from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { loadOnboardingSendQueueConfig } from "@/lib/candidate-onboarding-send-queue/send-queue-config-store";
import {
  appendOnboardingSendAttemptLog,
  createSendAttemptId,
  loadOnboardingSendQueueWorkerState,
  saveOnboardingSendQueueWorkerState,
} from "@/lib/candidate-onboarding-send-queue/send-queue-state-store";
import {
  enqueuePendingApprovalOnboardingRecords,
  reclaimStaleSendingRecords,
  transitionOnboardingRecordStatus,
} from "@/lib/candidate-onboarding-send-queue/send-queue-onboarding-updates";
import type {
  OnboardingSendAttemptLog,
  OnboardingSendQueueConfig,
} from "@/lib/candidate-onboarding-send-queue/types";
import { getCandidateWorkflowState, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { sleep } from "@/lib/candidate-onboarding-send-queue/sleep";

export type ProcessOnboardingSendQueueOptions = {
  force?: boolean;
  enqueuePending?: boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  sendDeps?: ExecuteOnboardingSendDeps;
  byUserId?: string;
};

export type ProcessOnboardingSendQueueResult = {
  processed: number;
  sent: number;
  retryScheduled: number;
  failed: number;
  skipped: number;
  reclaimed: number;
  enqueued: number;
  metrics: Awaited<ReturnType<typeof buildOnboardingSendQueueMetrics>>;
};

function isoNow(now: () => number): string {
  return new Date(now()).toISOString();
}

function isDueForSend(record: CandidateOnboardingRecord, nowMs: number): boolean {
  if (record.status === "queued") return true;
  if (record.status !== "retry_scheduled") return false;
  if (!record.nextRetryAt) return true;
  const retryMs = Date.parse(record.nextRetryAt);
  return Number.isFinite(retryMs) && retryMs <= nowMs;
}

function sortProcessable(
  records: CandidateOnboardingRecord[],
  nowMs: number,
): CandidateOnboardingRecord[] {
  return records
    .filter((record) => record.status === "queued" || record.status === "retry_scheduled")
    .filter((record) => isDueForSend(record, nowMs))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

async function resolveCandidateContact(candidateId: string): Promise<{
  candidateName: string;
  candidateEmail: string | null;
}> {
  const store = await readIngestionStore();
  const candidate = store.candidates[candidateId];
  if (!candidate) {
    return { candidateName: "Candidate", candidateEmail: null };
  }
  const name = `${candidate.firstName ?? ""} ${candidate.lastName ?? ""}`.trim() || "Candidate";
  return { candidateName: name, candidateEmail: candidatePrimaryEmail(candidate) };
}

async function clearWorkflowTransientFailure(candidateId: string): Promise<void> {
  const workflows = await getCandidateWorkflowState();
  const existing = workflows[candidateId];
  if (!existing || !existing.paperworkError) return;
  await upsertCandidateWorkflow({
    candidateId,
    workflowStatus: existing.workflowStatus,
    assignedRecruiter: existing.assignedRecruiter,
    assignedDM: existing.assignedDM,
    recruitingActions: existing.recruitingActions,
    paperworkStatus: existing.paperworkStatus === "failed" ? "not_sent" : existing.paperworkStatus,
    paperworkError: null,
    paperworkHistoryMessage: "Cleared transient paperwork error before send queue retry.",
    audit: { action: "paperwork_retry_cleared" },
  });
}

async function markOnboardingFailed(
  record: CandidateOnboardingRecord,
  error: string,
  now: string,
): Promise<void> {
  await transitionOnboardingRecordStatus({
    onboardingId: record.onboardingId,
    status: "failed",
    detail: error,
    now,
    patch: {
      failureReason: error,
      failedAt: now,
      lastSendAttemptAt: now,
      nextRetryAt: undefined,
    },
  });
}

async function scheduleRetry(
  record: CandidateOnboardingRecord,
  error: string,
  config: OnboardingSendQueueConfig,
  now: string,
  nowMs: number,
): Promise<string> {
  const attemptNumber = record.retryCount + 1;
  const delayMs = computeRetryDelayMs(attemptNumber, config.retryBackoffBaseMs);
  const nextRetryAt = new Date(nowMs + delayMs).toISOString();

  await transitionOnboardingRecordStatus({
    onboardingId: record.onboardingId,
    status: "retry_scheduled",
    detail: `Retry ${attemptNumber}/${config.maxRetries} scheduled — ${error}`,
    now,
    patch: {
      retryCount: attemptNumber,
      failureReason: error,
      nextRetryAt,
      lastSendAttemptAt: now,
    },
  });

  return nextRetryAt;
}

async function processOneRecord(input: {
  record: CandidateOnboardingRecord;
  config: OnboardingSendQueueConfig;
  now: () => number;
  sleepFn: (ms: number) => Promise<void>;
  sendDeps?: ExecuteOnboardingSendDeps;
  byUserId?: string;
  lastSendCompletedAtMs: number | null;
}): Promise<{
  outcome: OnboardingSendAttemptLog["outcome"];
  attemptLog: OnboardingSendAttemptLog;
  nextLastSendCompletedAtMs: number | null;
}> {
  const startedMs = input.now();
  const startedAt = new Date(startedMs).toISOString();
  const attemptNumber = input.record.retryCount + 1;
  const attemptId = createSendAttemptId();

  if (
    input.lastSendCompletedAtMs != null &&
    startedMs - input.lastSendCompletedAtMs < input.config.delayBetweenSendsMs
  ) {
    await input.sleepFn(input.config.delayBetweenSendsMs - (startedMs - input.lastSendCompletedAtMs));
  }

  await clearWorkflowTransientFailure(input.record.candidateId);

  await transitionOnboardingRecordStatus({
    onboardingId: input.record.onboardingId,
    status: "sending",
    detail: `Send attempt ${attemptNumber} started`,
    now: startedAt,
    patch: { lastSendAttemptAt: startedAt },
  });

  const contact = await resolveCandidateContact(input.record.candidateId);
  if (!contact.candidateEmail) {
    const error = "Candidate email is missing or invalid.";
    const endedAt = isoNow(input.now);
    await markOnboardingFailed(input.record, error, endedAt);
    const attemptLog: OnboardingSendAttemptLog = {
      attemptId,
      candidateId: input.record.candidateId,
      onboardingId: input.record.onboardingId,
      attemptNumber,
      startedAt,
      endedAt,
      durationMs: input.now() - startedMs,
      httpStatus: 400,
      dropboxResponse: null,
      retryScheduled: false,
      nextRetryAt: null,
      outcome: "failed",
      error,
    };
    await appendOnboardingSendAttemptLog(attemptLog);
    return { outcome: "failed", attemptLog, nextLastSendCompletedAtMs: input.lastSendCompletedAtMs };
  }

  const result = await executeOnboardingSend(
    {
      candidateId: input.record.candidateId,
      candidateName: contact.candidateName,
      candidateEmail: contact.candidateEmail,
      templateKey: input.config.defaultTemplateKey,
      byUserId: input.byUserId,
      recordWorkflowFailureOnError: false,
      inFlightOnboardingId: input.record.onboardingId,
    },
    input.sendDeps,
  );

  const endedMs = input.now();
  const endedAt = new Date(endedMs).toISOString();

  if (result.ok) {
    const attemptLog: OnboardingSendAttemptLog = {
      attemptId,
      candidateId: input.record.candidateId,
      onboardingId: input.record.onboardingId,
      attemptNumber,
      startedAt,
      endedAt,
      durationMs: endedMs - startedMs,
      httpStatus: 200,
      dropboxResponse: result.signingStatus,
      retryScheduled: false,
      nextRetryAt: null,
      outcome: "sent",
      error: null,
    };
    await appendOnboardingSendAttemptLog(attemptLog);
    return { outcome: "sent", attemptLog, nextLastSendCompletedAtMs: endedMs };
  }

  const fresh = await getOnboardingRecordById(input.record.onboardingId);
  const retryCount = fresh?.retryCount ?? input.record.retryCount;
  const canRetry = result.transient && retryCount < input.config.maxRetries;

  let outcome: OnboardingSendAttemptLog["outcome"] = "failed";
  let nextRetryAt: string | null = null;

  if (canRetry && fresh) {
    nextRetryAt = await scheduleRetry(fresh, result.error, input.config, endedAt, endedMs);
    outcome = "retry_scheduled";
  } else {
    await markOnboardingFailed(fresh ?? input.record, result.error, endedAt);
    const { recordCandidatePaperworkFailed } = await import("@/lib/candidate-workflow-store");
    await recordCandidatePaperworkFailed({
      candidateId: input.record.candidateId,
      error: result.error,
      byUserId: input.byUserId,
    });
  }

  const attemptLog: OnboardingSendAttemptLog = {
    attemptId,
    candidateId: input.record.candidateId,
    onboardingId: input.record.onboardingId,
    attemptNumber,
    startedAt,
    endedAt,
    durationMs: endedMs - startedMs,
    httpStatus: result.httpStatus ?? resolveSendHttpStatus(result.error),
    dropboxResponse: result.error,
    retryScheduled: outcome === "retry_scheduled",
    nextRetryAt,
    outcome,
    error: result.error,
  };
  await appendOnboardingSendAttemptLog(attemptLog);
  return {
    outcome,
    attemptLog,
    nextLastSendCompletedAtMs: input.lastSendCompletedAtMs,
  };
}

export async function startOnboardingSendQueue(input?: {
  enqueuePending?: boolean;
}): Promise<{ running: true; enqueued: number }> {
  const enqueuePending = input?.enqueuePending !== false;
  const enqueued = enqueuePending ? (await enqueuePendingApprovalOnboardingRecords()).enqueued : 0;
  const worker = await loadOnboardingSendQueueWorkerState();
  await saveOnboardingSendQueueWorkerState({
    ...worker,
    running: true,
    lastError: null,
    updatedAt: new Date().toISOString(),
  });
  return { running: true, enqueued };
}

export async function stopOnboardingSendQueue(): Promise<{ running: false }> {
  const worker = await loadOnboardingSendQueueWorkerState();
  await saveOnboardingSendQueueWorkerState({
    ...worker,
    running: false,
    updatedAt: new Date().toISOString(),
  });
  return { running: false };
}

export async function processOnboardingSendQueue(
  options: ProcessOnboardingSendQueueOptions = {},
): Promise<ProcessOnboardingSendQueueResult> {
  const nowFn = options.now ?? (() => Date.now());
  const sleepFn = options.sleep ?? sleep;
  const config = await loadOnboardingSendQueueConfig();
  const worker = await loadOnboardingSendQueueWorkerState();

  let enqueued = 0;
  if (options.enqueuePending) {
    enqueued = (await enqueuePendingApprovalOnboardingRecords(isoNow(nowFn))).enqueued;
  }

  if (!worker.running && !options.force) {
    return {
      processed: 0,
      sent: 0,
      retryScheduled: 0,
      failed: 0,
      skipped: 0,
      reclaimed: 0,
      enqueued,
      metrics: await buildOnboardingSendQueueMetrics(nowFn()),
    };
  }

  const reclaimed = await reclaimStaleSendingRecords({
    staleMs: config.sendingStaleMs,
    now: nowFn(),
  });

  const records = await listAllCandidateOnboardingRecords();
  const due = sortProcessable(records, nowFn());
  const remainingAfterBatch = Math.max(0, due.length - config.batchSize);

  if (worker.lastBatchCompletedAt && due.length > 0) {
    const batchElapsed = nowFn() - Date.parse(worker.lastBatchCompletedAt);
    if (Number.isFinite(batchElapsed) && batchElapsed < config.delayBetweenBatchesMs) {
      await sleepFn(config.delayBetweenBatchesMs - batchElapsed);
    }
  }

  let processed = 0;
  let sent = 0;
  let retryScheduled = 0;
  let failed = 0;
  let skipped = 0;
  let lastSendCompletedAtMs = worker.lastSendCompletedAt
    ? Date.parse(worker.lastSendCompletedAt)
    : null;
  if (!Number.isFinite(lastSendCompletedAtMs ?? NaN)) lastSendCompletedAtMs = null;

  for (const record of due) {
    if (processed >= config.batchSize) break;

    const fresh = await getOnboardingRecordById(record.onboardingId);
    if (!fresh || (fresh.status !== "queued" && fresh.status !== "retry_scheduled")) {
      skipped += 1;
      continue;
    }
    if (!isDueForSend(fresh, nowFn())) {
      skipped += 1;
      continue;
    }

    try {
      const result = await processOneRecord({
        record: fresh,
        config,
        now: nowFn,
        sleepFn,
        sendDeps: options.sendDeps,
        byUserId: options.byUserId,
        lastSendCompletedAtMs,
      });
      processed += 1;
      if (result.outcome === "sent") sent += 1;
      else if (result.outcome === "retry_scheduled") retryScheduled += 1;
      else if (result.outcome === "failed") failed += 1;
      else skipped += 1;
      lastSendCompletedAtMs = result.nextLastSendCompletedAtMs;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await saveOnboardingSendQueueWorkerState({
        ...worker,
        running: worker.running,
        lastTickAt: isoNow(nowFn),
        lastError: message,
        sendsCompletedThisSession: worker.sendsCompletedThisSession + sent,
        lastSendCompletedAt: lastSendCompletedAtMs
          ? new Date(lastSendCompletedAtMs).toISOString()
          : worker.lastSendCompletedAt,
        updatedAt: isoNow(nowFn),
      });
      throw error;
    }
  }

  const updatedWorker = await loadOnboardingSendQueueWorkerState();
  const batchCompletedAt =
    processed > 0 && remainingAfterBatch > 0 ? isoNow(nowFn) : updatedWorker.lastBatchCompletedAt;
  await saveOnboardingSendQueueWorkerState({
    ...updatedWorker,
    running: updatedWorker.running,
    lastTickAt: isoNow(nowFn),
    lastError: null,
    sendsCompletedThisSession: updatedWorker.sendsCompletedThisSession + sent,
    lastSendCompletedAt: lastSendCompletedAtMs
      ? new Date(lastSendCompletedAtMs).toISOString()
      : updatedWorker.lastSendCompletedAt,
    lastBatchCompletedAt: batchCompletedAt,
    updatedAt: isoNow(nowFn),
  });

  return {
    processed,
    sent,
    retryScheduled,
    failed,
    skipped,
    reclaimed,
    enqueued,
    metrics: await buildOnboardingSendQueueMetrics(nowFn()),
  };
}
