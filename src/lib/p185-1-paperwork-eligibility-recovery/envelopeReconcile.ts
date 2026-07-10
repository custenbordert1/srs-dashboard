import { getSignatureRequest, type DropboxSignRequestSummary } from "@/lib/dropbox-sign";
import type {
  P1851EnvelopeLifecycle,
  P1851EnvelopeReconcileRow,
} from "@/lib/p185-1-paperwork-eligibility-recovery/types";

export type P1851EnvelopeReconcileDeps = {
  getSignatureRequest?: typeof getSignatureRequest;
};

export function mapDropboxSummaryToP1851Lifecycle(
  summary: DropboxSignRequestSummary,
): P1851EnvelopeLifecycle {
  if (summary.isDeclined) return "declined";
  if (summary.isComplete) return "signed";
  const raw = (summary.rawStatus || "").toLowerCase();
  if (raw.includes("cancel")) return "canceled";
  if (raw.includes("expir")) return "expired";
  if (raw.includes("error") || raw.includes("fail")) return "failed";
  if (raw === "viewed" || summary.signatures.some((s) => s.lastViewedAt)) return "viewed";
  if (summary.signatureRequestId) return "confirmed_sent";
  return "unknown";
}

export function isReplacementEligibleLifecycle(lifecycle: P1851EnvelopeLifecycle): boolean {
  return (
    lifecycle === "declined" ||
    lifecycle === "canceled" ||
    lifecycle === "expired" ||
    lifecycle === "failed"
  );
}

/**
 * Reconcile existing envelopes. Never creates a new send.
 * Replacement eligibility is flagged for operator review only.
 */
export async function reconcileP1851Envelopes(input: {
  items: Array<{
    candidateId: string;
    envelopeId: string;
    previousPaperworkStatus?: string | null;
  }>;
  deps?: P1851EnvelopeReconcileDeps;
  concurrency?: number;
}): Promise<{
  rows: P1851EnvelopeReconcileRow[];
  byLifecycle: Record<string, number>;
  replacementReview: number;
  unresolved: number;
}> {
  const getSig = input.deps?.getSignatureRequest ?? getSignatureRequest;
  const concurrency = Math.max(1, input.concurrency ?? 4);
  const rows: P1851EnvelopeReconcileRow[] = [];
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < input.items.length) {
      const current = input.items[idx++]!;
      try {
        const summary = await getSig(current.envelopeId);
        const lifecycle = mapDropboxSummaryToP1851Lifecycle(summary);
        const replacementEligible = isReplacementEligibleLifecycle(lifecycle);
        rows.push({
          candidateId: current.candidateId,
          envelopeId: current.envelopeId,
          previousPaperworkStatus: current.previousPaperworkStatus ?? null,
          lifecycle,
          replacementEligible,
          replacementReason: replacementEligible
            ? `Envelope lifecycle=${lifecycle}; explicit replacement-send classification required before resend.`
            : null,
          error: null,
        });
      } catch (err) {
        rows.push({
          candidateId: current.candidateId,
          envelopeId: current.envelopeId,
          previousPaperworkStatus: current.previousPaperworkStatus ?? null,
          lifecycle: "unknown",
          replacementEligible: false,
          replacementReason: null,
          error: err instanceof Error ? err.message : "Verification failed",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const byLifecycle: Record<string, number> = {};
  let replacementReview = 0;
  let unresolved = 0;
  for (const row of rows) {
    byLifecycle[row.lifecycle] = (byLifecycle[row.lifecycle] ?? 0) + 1;
    if (row.replacementEligible) replacementReview += 1;
    if (row.lifecycle === "unknown" || row.error) unresolved += 1;
  }

  return { rows, byLifecycle, replacementReview, unresolved };
}
