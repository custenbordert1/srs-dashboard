import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { buildApprovalModeProductionFromStores } from "@/lib/approval-mode-production/build-approval-mode-production";
import { loadP97State } from "@/lib/approval-mode-production/approval-mode-store";
import { persistApprovedCandidate } from "@/lib/approval-mode-production/persist-approved-candidate";
import type { ApprovalModePersistResult } from "@/lib/approval-mode-production/types";
import { buildP84SendQueuePreviewFromStores } from "@/lib/p84-send-queue-preview";

export async function executeApprovalModePersistence(input: {
  candidateIds: string[];
  approvedBy: string;
  approvedByUserId: string;
  mtdOnly?: boolean;
}): Promise<ApprovalModePersistResult> {
  if (!input.candidateIds.length) {
    throw new Error("candidateIds required — no auto-approval of batch without explicit IDs.");
  }

  const uniqueIds = [...new Set(input.candidateIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error("candidateIds required — no auto-approval.");
  }

  const p84Flags = await loadP84FeatureFlags();
  if (p84Flags.liveSend) {
    throw new Error("P97 blocked: P84 liveSend is enabled. Disable liveSend before approval-mode persistence.");
  }

  const [p96, bundle, state] = await Promise.all([
    buildP84SendQueuePreviewFromStores({ mtdOnly: input.mtdOnly }),
    getCandidateWorkflowBundle(),
    loadP97State(),
  ]);

  const sendById = new Map(p96.sendQueue.map((e) => [e.candidateId, e]));
  const alreadyPersisted = new Set(state.persisted.map((p) => p.candidateId));
  const persisted: string[] = [];
  const skipped: Array<{ candidateId: string; reason: string }> = [];

  for (const candidateId of uniqueIds) {
    if (alreadyPersisted.has(candidateId)) {
      skipped.push({ candidateId, reason: "Already persisted in P97 state." });
      continue;
    }

    const sendEntry = sendById.get(candidateId);
    if (!sendEntry) {
      skipped.push({ candidateId, reason: "Not in P96 send queue or not P84-eligible." });
      continue;
    }

    if (sendEntry.eligibilityResult !== "eligible" || !sendEntry.inSendQueue) {
      skipped.push({ candidateId, reason: "Candidate did not pass P84 send queue gates." });
      continue;
    }

    await persistApprovedCandidate({
      sendEntry,
      existingWorkflow: bundle.workflows[candidateId],
      approvedBy: input.approvedBy,
      approvedByUserId: input.approvedByUserId,
    });
    persisted.push(candidateId);
  }

  const report = await buildApprovalModeProductionFromStores({ mtdOnly: input.mtdOnly });

  return { ok: true, persisted, skipped, report };
}
