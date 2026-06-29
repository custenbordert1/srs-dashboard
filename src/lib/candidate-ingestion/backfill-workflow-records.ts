import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { getCandidateWorkflowState, upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type {
  CandidateWorkflowRecord,
  CandidateWorkflowStatus,
} from "@/lib/candidate-workflow-types";
import {
  loadActiveOnboardingRecordsByCandidate,
  onboardingHasRestorablePaperworkState,
  reconcileAllWorkflowsFromOnboarding,
} from "@/lib/workflow-onboarding-reconciliation";
import { hasAdvancedPaperworkState } from "@/lib/workflow-onboarding-reconciliation/workflow-durability";
import { reconcileWorkflowFromOnboarding } from "@/lib/workflow-onboarding-reconciliation/reconcile-workflow-from-onboarding";

function initialWorkflowStatus(candidate: BreezyCandidate): CandidateWorkflowStatus {
  const stage = candidate.stage.toLowerCase();
  if (stage.includes("not qualified") || stage.includes("disqualif")) return "Not Qualified";
  if (stage.includes("qualified")) return "Qualified";
  if (stage.includes("applied")) return "Applied";
  if (stage.includes("paperwork")) return "Paperwork Needed";
  if (stage.includes("signed")) return "Signed";
  return "Needs Review";
}

async function restoreWorkflowFromOnboardingIfNeeded(input: {
  candidateId: string;
  workflow: CandidateWorkflowRecord | null | undefined;
  onboarding: CandidateOnboardingRecord | null | undefined;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord | null> {
  if (!onboardingHasRestorablePaperworkState(input.onboarding)) {
    return null;
  }

  const result = await reconcileWorkflowFromOnboarding({
    candidateId: input.candidateId,
    workflow: input.workflow,
    onboarding: input.onboarding,
    byUserId: input.byUserId,
  });
  return result.record;
}

export async function backfillWorkflowRecordsForCandidates(input: {
  candidates: BreezyCandidate[];
  workflows: Record<string, CandidateWorkflowRecord>;
  byUserId?: string;
}): Promise<{ created: number; reconciled: number; records: CandidateWorkflowRecord[] }> {
  const persisted = await getCandidateWorkflowState();
  const onboardingByCandidate = await loadActiveOnboardingRecordsByCandidate();
  const records: CandidateWorkflowRecord[] = [];
  let created = 0;
  const reconciledIds = new Set<string>();

  for (const [candidateId, record] of Object.entries(persisted)) {
    input.workflows[candidateId] = record;
  }

  for (const candidate of input.candidates) {
    const candidateId = candidate.candidateId;
    const onboarding = onboardingByCandidate.get(candidateId) ?? null;
    const existing = persisted[candidateId] ?? input.workflows[candidateId];

    if (existing) {
      const restored = await restoreWorkflowFromOnboardingIfNeeded({
        candidateId,
        workflow: existing,
        onboarding,
        byUserId: input.byUserId,
      });
      if (restored) {
        input.workflows[candidateId] = restored;
        records.push(restored);
        reconciledIds.add(candidateId);
        continue;
      }
      input.workflows[candidateId] = existing;
      continue;
    }

    const inMemory = input.workflows[candidateId];
    if (inMemory && hasAdvancedPaperworkState(inMemory)) {
      continue;
    }

    if (onboardingHasRestorablePaperworkState(onboarding)) {
      const restored = await restoreWorkflowFromOnboardingIfNeeded({
        candidateId,
        workflow: null,
        onboarding,
        byUserId: input.byUserId,
      });
      if (restored) {
        records.push(restored);
        input.workflows[candidateId] = restored;
        reconciledIds.add(candidateId);
        continue;
      }
    }

    const record = await upsertCandidateWorkflow({
      candidateId,
      workflowStatus: initialWorkflowStatus(candidate),
      assignedRecruiter: "Unassigned",
      audit: {
        action: "ingestion_import",
        byUserId: input.byUserId,
        metadata: {
          positionId: candidate.positionId,
          positionName: candidate.positionName,
          appliedDate: candidate.appliedDate,
        },
      },
    });
    records.push(record);
    input.workflows[candidateId] = record;
    created += 1;
  }

  const batch = await reconcileAllWorkflowsFromOnboarding({
    byUserId: input.byUserId,
    candidateIds: input.candidates.map((row) => row.candidateId),
    workflows: input.workflows,
    onboardingByCandidate,
  });

  for (const row of batch.results) {
    if (row.reconciled) reconciledIds.add(row.candidateId);
    if (!row.reconciled) continue;
    const workflow = input.workflows[row.candidateId];
    if (!workflow) continue;
    if (!records.some((record) => record.candidateId === row.candidateId)) {
      records.push(workflow);
    }
  }

  return { created, reconciled: reconciledIds.size, records };
}
