import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  createOnboardingId,
  findActiveOnboardingRecord,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { processSignatureStatus } from "@/lib/candidate-onboarding-engine/process-signature-status";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";

function hasActivePacket(row: ScoredCandidateWorkflowRow): boolean {
  return Boolean(
    row.signatureRequestId &&
      (row.paperworkStatus === "sent" ||
        row.paperworkStatus === "viewed" ||
        row.workflowStatus === "Paperwork Sent"),
  );
}

async function markReadyForMel(input: {
  row: ScoredCandidateWorkflowRow;
  orchestratorRunId?: string;
  byUserId?: string;
}): Promise<boolean> {
  if (input.row.workflowStatus === "Ready for MEL" || input.row.workflowStatus === "Loaded in MEL") {
    return false;
  }

  await upsertCandidateWorkflow({
    candidateId: input.row.candidateId,
    workflowStatus: "Ready for MEL",
    note: "P84 signature monitoring: paperwork complete — candidate prepared for MEL (not loaded).",
    audit: { action: "onboarding_ready_for_mel", byUserId: input.byUserId },
  });

  const existing = await findActiveOnboardingRecord(input.row.candidateId);
  const now = new Date().toISOString();
  await recordCandidateOnboarding({
    onboardingId: existing?.onboardingId ?? createOnboardingId(),
    orchestratorRunId: input.orchestratorRunId,
    candidateId: input.row.candidateId,
    signatureRequestId: existing?.signatureRequestId ?? input.row.signatureRequestId ?? undefined,
    status: "ready_for_mel",
    paperworkComplete: true,
    readyForMel: true,
    createdAt: existing?.createdAt ?? now,
    completedAt: now,
    retryCount: existing?.retryCount ?? 0,
    escalated: existing?.escalated ?? false,
    statusHistory: [
      ...(existing?.statusHistory ?? []),
      { at: now, status: "ready_for_mel", detail: "P84 — prepared for P66 MEL placement" },
    ],
  });
  return true;
}

function shouldMonitorCandidate(row: ScoredCandidateWorkflowRow): boolean {
  if (row.workflowStatus === "Ready for MEL" || row.workflowStatus === "Loaded in MEL") {
    return false;
  }
  if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") {
    return true;
  }
  return hasActivePacket(row);
}

export async function runSignatureMonitoring(input: {
  candidates: ScoredCandidateWorkflowRow[];
  orchestratorRunId?: string;
  byUserId?: string;
}): Promise<{ synced: number; readyForMel: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;
  let readyForMel = 0;

  for (const row of input.candidates) {
    if (!shouldMonitorCandidate(row) || !row.signatureRequestId) continue;
    if (row.paperworkStatus === "signed" || row.workflowStatus === "Signed") {
      if (await markReadyForMel({ row, orchestratorRunId: input.orchestratorRunId, byUserId: input.byUserId })) {
        readyForMel += 1;
      }
      continue;
    }

    const result = await processSignatureStatus({
      signatureRequestId: row.signatureRequestId,
      byUserId: input.byUserId,
    });
    if (!result.ok) {
      if (result.error) errors.push(result.error);
      continue;
    }
    synced += 1;

    if (result.paperworkStatus === "signed") {
      if (await markReadyForMel({ row, orchestratorRunId: input.orchestratorRunId, byUserId: input.byUserId })) {
        readyForMel += 1;
      }
    }
  }

  return { synced, readyForMel, errors };
}
