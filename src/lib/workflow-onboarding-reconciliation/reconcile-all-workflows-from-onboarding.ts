import type {
  CandidateOnboardingRecord,
  OnboardingPacketStatus,
} from "@/lib/candidate-onboarding-engine/types";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { paperworkStatusFromOnboarding } from "@/lib/workflow-onboarding-reconciliation/workflow-durability";
import {
  reconcileWorkflowFromOnboarding,
  type ReconcileWorkflowFromOnboardingResult,
} from "@/lib/workflow-onboarding-reconciliation/reconcile-workflow-from-onboarding";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";

const TERMINAL_ONBOARDING_STATUSES = new Set<OnboardingPacketStatus>([
  "failed",
  "declined",
  "expired",
]);

export type ReconcileAllWorkflowsFromOnboardingResult = {
  scanned: number;
  reconciled: number;
  skipped: number;
  results: Array<{
    candidateId: string;
    reconciled: boolean;
    skippedReason: string | null;
    changes: string[];
  }>;
};

export function onboardingHasRestorablePaperworkState(
  onboarding: Pick<CandidateOnboardingRecord, "status"> | null | undefined,
): boolean {
  if (!onboarding) return false;
  return paperworkStatusFromOnboarding(onboarding.status) !== null;
}

export function mapActiveOnboardingRecordsByCandidate(
  records: CandidateOnboardingRecord[],
): Map<string, CandidateOnboardingRecord> {
  const map = new Map<string, CandidateOnboardingRecord>();
  for (const record of records) {
    if (TERMINAL_ONBOARDING_STATUSES.has(record.status)) continue;
    const existing = map.get(record.candidateId);
    if (!existing || Date.parse(record.createdAt) > Date.parse(existing.createdAt)) {
      map.set(record.candidateId, record);
    }
  }
  return map;
}

export async function loadActiveOnboardingRecordsByCandidate(): Promise<
  Map<string, CandidateOnboardingRecord>
> {
  return mapActiveOnboardingRecordsByCandidate(await listAllCandidateOnboardingRecords());
}

export async function reconcileAllWorkflowsFromOnboarding(input?: {
  byUserId?: string;
  candidateIds?: string[];
  workflows?: Record<string, CandidateWorkflowRecord>;
  onboardingByCandidate?: Map<string, CandidateOnboardingRecord>;
}): Promise<ReconcileAllWorkflowsFromOnboardingResult> {
  const onboardingByCandidate =
    input?.onboardingByCandidate ?? (await loadActiveOnboardingRecordsByCandidate());
  const workflows = input?.workflows ?? (await getCandidateWorkflowState());
  const candidateFilter = input?.candidateIds ? new Set(input.candidateIds) : null;

  const results: ReconcileAllWorkflowsFromOnboardingResult["results"] = [];
  let reconciled = 0;
  let skipped = 0;

  for (const [candidateId, onboarding] of onboardingByCandidate) {
    if (candidateFilter && !candidateFilter.has(candidateId)) continue;
    if (!onboardingHasRestorablePaperworkState(onboarding)) {
      skipped += 1;
      results.push({
        candidateId,
        reconciled: false,
        skippedReason: `onboarding_status_not_restorable:${onboarding.status}`,
        changes: [],
      });
      continue;
    }

    const outcome: ReconcileWorkflowFromOnboardingResult = await reconcileWorkflowFromOnboarding({
      candidateId,
      workflow: workflows[candidateId] ?? null,
      onboarding,
      byUserId: input?.byUserId,
    });

    if (outcome.reconciled) {
      reconciled += 1;
      if (outcome.record) {
        workflows[candidateId] = outcome.record;
      }
    } else {
      skipped += 1;
    }

    results.push({
      candidateId,
      reconciled: outcome.reconciled,
      skippedReason: outcome.skippedReason,
      changes: outcome.changes,
    });
  }

  return {
    scanned: results.length,
    reconciled,
    skipped,
    results,
  };
}
