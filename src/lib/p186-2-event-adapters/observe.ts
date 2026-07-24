import { createHash } from "node:crypto";
import {
  adaptDropboxSignStatus,
  adaptWorkflowStoreChange,
} from "@/lib/p186-2-event-adapters/adapters";
import { readP1862Flags } from "@/lib/p186-2-event-adapters/flags";
import { ShadowDualWriteIngestor } from "@/lib/p186-2-event-adapters/ingest";
import type { P186IngestResult } from "@/lib/p186-2-event-adapters/types";

/**
 * Fire-and-forget shadow observe helpers.
 * MUST NEVER throw to production callers. MUST NEVER write production stores.
 */
export async function observeShadowEventSafe(
  run: () => Promise<P186IngestResult | void>,
): Promise<P186IngestResult | null> {
  try {
    const flags = readP1862Flags();
    if (!flags.shadowIngestion) return null;
    const result = await run();
    return result ?? null;
  } catch {
    return null;
  }
}

export async function observeDropboxSignWebhookSafe(input: {
  candidateId: string;
  eventType: string;
  signatureRequestId?: string | null;
}): Promise<void> {
  await observeShadowEventSafe(async () => {
    const flags = readP1862Flags();
    if (!flags.adapterDropbox) return;
    const hash = input.signatureRequestId
      ? createHash("sha256").update(input.signatureRequestId).digest("hex").slice(0, 12)
      : null;
    const adapted = adaptDropboxSignStatus({
      candidateId: input.candidateId,
      eventType: input.eventType,
      signatureRequestIdHash: hash,
    });
    if (!adapted.ok) return;
    const ingestor = new ShadowDualWriteIngestor(undefined, flags);
    return ingestor.ingest(adapted.event);
  });
}

export async function observeWorkflowUpsertSafe(input: {
  candidateId: string;
  workflowStatus?: string | null;
  paperworkStatus?: string | null;
}): Promise<void> {
  await observeShadowEventSafe(async () => {
    const flags = readP1862Flags();
    if (!flags.shadowIngestion) return;
    const adapted = adaptWorkflowStoreChange(input);
    if (!adapted.ok) return;
    const ingestor = new ShadowDualWriteIngestor(undefined, flags);
    return ingestor.ingest(adapted.event);
  });
}
