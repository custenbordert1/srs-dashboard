import type { CandidateOnboardingRecord, OnboardingPacketStatus } from "@/lib/candidate-onboarding-engine/types";
import {
  getOnboardingRecordById,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";

function appendHistory(
  record: CandidateOnboardingRecord,
  status: OnboardingPacketStatus,
  detail: string,
  at: string,
): CandidateOnboardingRecord {
  return {
    ...record,
    status,
    statusHistory: [...record.statusHistory, { at, status, detail }],
  };
}

export async function transitionOnboardingRecordStatus(input: {
  onboardingId: string;
  status: OnboardingPacketStatus;
  detail: string;
  now?: string;
  patch?: Partial<CandidateOnboardingRecord>;
}): Promise<CandidateOnboardingRecord | null> {
  const now = input.now ?? new Date().toISOString();
  const current = await getOnboardingRecordById(input.onboardingId);
  if (!current) return null;

  const merged: CandidateOnboardingRecord = {
    ...current,
    ...input.patch,
    status: input.status,
  };
  if (input.patch) {
    for (const [key, value] of Object.entries(input.patch)) {
      if (value === undefined) {
        delete (merged as Record<string, unknown>)[key];
      }
    }
  }

  const updated = appendHistory(merged, input.status, input.detail, now);
  await recordCandidateOnboarding(updated);
  return updated;
}

export async function enqueuePendingApprovalOnboardingRecords(
  now = new Date().toISOString(),
): Promise<{ enqueued: number; onboardingIds: string[] }> {
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const records = await listAllCandidateOnboardingRecords();
  const onboardingIds: string[] = [];

  for (const record of records) {
    if (record.status !== "pending_approval") continue;
    await transitionOnboardingRecordStatus({
      onboardingId: record.onboardingId,
      status: "queued",
      detail: "Queued for onboarding send worker",
      now,
    });
    onboardingIds.push(record.onboardingId);
  }

  return { enqueued: onboardingIds.length, onboardingIds };
}

export async function reclaimStaleSendingRecords(input: {
  staleMs: number;
  now?: number;
}): Promise<number> {
  const nowMs = input.now ?? Date.now();
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const records = await listAllCandidateOnboardingRecords();
  let reclaimed = 0;

  for (const record of records) {
    if (record.status !== "sending" || !record.lastSendAttemptAt) continue;
    const attemptMs = Date.parse(record.lastSendAttemptAt);
    if (!Number.isFinite(attemptMs) || nowMs - attemptMs < input.staleMs) continue;

    await transitionOnboardingRecordStatus({
      onboardingId: record.onboardingId,
      status: record.nextRetryAt ? "retry_scheduled" : "queued",
      detail: "Reclaimed stale sending record after interruption",
      patch: { lastSendAttemptAt: undefined },
    });
    reclaimed += 1;
  }

  return reclaimed;
}
