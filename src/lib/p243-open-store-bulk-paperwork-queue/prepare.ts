import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  P243_OSBPQ_PHASE,
  type P243OsbpqQueueItem,
} from "@/lib/p243-open-store-bulk-paperwork-queue/types";

/**
 * Keep first occurrence per candidateId (queue is already priority-sorted).
 */
export function dedupeQueueByCandidateId(items: P243OsbpqQueueItem[]): {
  unique: P243OsbpqQueueItem[];
  droppedDuplicates: number;
} {
  const seen = new Set<string>();
  const unique: P243OsbpqQueueItem[] = [];
  let droppedDuplicates = 0;
  for (const item of items) {
    if (seen.has(item.candidateId)) {
      droppedDuplicates += 1;
      continue;
    }
    seen.add(item.candidateId);
    unique.push(item);
  }
  return { unique, droppedDuplicates };
}

/**
 * Durable prepare before P243 pull/send:
 * - Stale Paperwork Sent (no live packet) → Paperwork Needed
 * - Applied / Needs Review / Qualified → Paperwork Needed
 * Clears await-signature action fields so pullPendingCandidates includes them.
 * Does NOT mark Paperwork Sent and does not invent signature IDs.
 */
export async function prepareEligibleForPaperworkSend(input: {
  eligible: P243OsbpqQueueItem[];
  persist: boolean;
}): Promise<{ prepared: number; notes: string[] }> {
  const notes: string[] = [];
  if (!input.persist || input.eligible.length === 0) {
    return { prepared: 0, notes: ["Prepare skipped (persist=false or empty)."] };
  }

  const workflows = await getCandidateWorkflowState();
  let prepared = 0;

  for (const item of input.eligible) {
    const before = workflows[item.candidateId];
    const stage = String(before?.workflowStatus ?? item.workflowStage);
    const paperwork = String(before?.paperworkStatus ?? item.paperworkStatus);
    const sig = String(before?.signatureRequestId ?? "").trim();
    const sentAt = String(before?.paperworkSentAt ?? "").trim();
    const hasLivePacket =
      Boolean(sig) ||
      paperwork === "sent" ||
      paperwork === "viewed" ||
      paperwork === "signed" ||
      Boolean(sentAt);

    if (hasLivePacket) {
      notes.push(`Skip prepare ${item.name}: live packet already present.`);
      continue;
    }

    const needsStage =
      stage === "Paperwork Sent" ||
      stage === "Applied" ||
      stage === "Needs Review" ||
      stage === "Qualified" ||
      stage === "Paperwork Needed";

    if (!needsStage) {
      notes.push(`Skip prepare ${item.name}: stage=${stage}`);
      continue;
    }

    if (stage === "Paperwork Needed" && !before?.actionType) {
      continue;
    }

    await upsertCandidateWorkflow({
      candidateId: item.candidateId,
      workflowStatus: "Paperwork Needed",
      forceWorkflowStatus: true,
      paperworkStatus: "not_sent",
      forcePaperworkStatus: true,
      signatureRequestId: null,
      paperworkSentAt: null,
      paperworkViewedAt: null,
      paperworkSignedAt: null,
      paperworkError: null,
      paperworkTemplateKey: null,
      actionType: null,
      requiredAction: "Send Paperwork",
      actionReason: `${P243_OSBPQ_PHASE}: prepare stale/intake row for bulk send`,
      actionPriority: "high",
      nextActionNeeded: "Send Paperwork",
      audit: {
        action: "p243_osbpq_prepare_paperwork_needed",
        byUserId: "Taylor Custenborder",
        metadata: {
          phase: P243_OSBPQ_PHASE,
          previousStage: stage,
          storeLabel: item.storeLabel,
          idempotencyKey: item.idempotencyKey,
        },
      },
    });
    prepared += 1;
    notes.push(
      `Prepared ${item.name} (${item.candidateId}): ${stage} → Paperwork Needed`,
    );
  }

  notes.push(`Prepared ${prepared}/${input.eligible.length} candidate(s) for send.`);
  return { prepared, notes };
}
