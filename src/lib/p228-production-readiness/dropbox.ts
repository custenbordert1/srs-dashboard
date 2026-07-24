import type {
  P228CandidateSnapshot,
  P228DropboxSignHealth,
  P228HistoricalContext,
} from "@/lib/p228-production-readiness/types";

/**
 * Dropbox Sign health from durable workflow paperwork fields only (no live API).
 */
export function assessDropboxHealth(
  candidates: P228CandidateSnapshot[],
  historical: P228HistoricalContext,
): P228DropboxSignHealth {
  let pending = 0;
  let viewed = 0;
  let signed = 0;
  let expired = 0;
  let cancelled = 0;
  let failed = 0;
  let withSignatureRequestId = 0;
  let duplicatePreventionCount = 0;

  const seenSig = new Set<string>();

  for (const c of candidates) {
    const sig = String(c.signatureRequestId ?? "").trim();
    if (sig) {
      withSignatureRequestId += 1;
      if (seenSig.has(sig)) duplicatePreventionCount += 1;
      else seenSig.add(sig);
    }

    switch (c.paperworkStatus) {
      case "sent":
        pending += 1;
        break;
      case "viewed":
        viewed += 1;
        break;
      case "signed":
        signed += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "declined":
        cancelled += 1;
        break;
      default:
        break;
    }

    // Expired is not a first-class paperworkStatus in durable store; count stage mismatches.
    if (c.workflowStatus === "Paperwork Sent" && c.paperworkStatus === "not_sent" && !sig) {
      expired += 1;
    }
  }

  return {
    pending,
    viewed,
    signed,
    expired,
    cancelled,
    failed,
    duplicatePreventionCount,
    withSignatureRequestId,
    recentControlledSends: {
      p219_p221: historical.p219_p221ControlledSendsSucceeded ? 2 : 0,
      p227: historical.p227LiveSendsSucceeded,
      testMode: historical.p227TestMode,
    },
  };
}
