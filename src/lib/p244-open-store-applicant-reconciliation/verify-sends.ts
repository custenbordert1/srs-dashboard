import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getSignatureRequest } from "@/lib/dropbox-sign";
import { normalizeEmailFingerprint } from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import type { P243OsbpqQueueItem } from "@/lib/p243-open-store-bulk-paperwork-queue/types";
import type {
  P244DispositionCategory,
  P244SendVerification,
} from "@/lib/p244-open-store-applicant-reconciliation/types";

function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const fa = normalizeEmailFingerprint(a);
  const fb = normalizeEmailFingerprint(b);
  if (!fa || !fb) return false;
  return fa === fb;
}

function breezyStageLooksCorrect(stage: string, paperwork: string, signed: boolean): boolean {
  const s = stage.trim();
  if (signed || paperwork === "signed") {
    return s === "Signed" || s === "Ready for MEL" || s === "Loaded in MEL" || s === "Active Rep";
  }
  return (
    s === "Paperwork Sent" ||
    s === "Signed" ||
    s === "Ready for MEL" ||
    paperwork === "sent" ||
    paperwork === "viewed" ||
    paperwork === "signed"
  );
}

/**
 * Verify already_sent classification with real Dropbox evidence.
 * Do NOT trust stale actionType / workflow stage alone.
 */
export async function verifyPriorSend(input: {
  item: P243OsbpqQueueItem;
  onboardingSigByCandidate: Map<string, { signatureRequestId: string; email: string | null }>;
  verifyDropbox: boolean;
}): Promise<P244SendVerification> {
  const { item, onboardingSigByCandidate, verifyDropbox } = input;
  const workflowSig = String(item.signatureRequestId ?? "").trim() || null;
  const onboarding = onboardingSigByCandidate.get(item.candidateId);
  const onboardingSig = String(onboarding?.signatureRequestId ?? "").trim() || null;
  const signatureRequestId = workflowSig || onboardingSig;
  const source: P244SendVerification["source"] = workflowSig
    ? "workflow"
    : onboardingSig
      ? "onboarding"
      : item.knownPriorSend
        ? "known_prior"
        : "none";

  const workflowPaperworkSent =
    item.workflowStage === "Paperwork Sent" ||
    item.paperworkStatus === "sent" ||
    item.paperworkStatus === "viewed" ||
    item.paperworkStatus === "signed" ||
    item.workflowStage === "Signed";

  if (!signatureRequestId) {
    // Stale stage/actionType only — reclassify for recovery
    return {
      verified: false,
      signatureRequestId: null,
      signerEmailMatch: null,
      packetStatus: null,
      packetCancelledOrInvalid: null,
      workflowPaperworkSent,
      breezyStageOk: false,
      source,
      detail:
        "No signatureRequestId on workflow or onboarding — refusing already_sent from stale fields alone.",
      reclassifiedTo: workflowPaperworkSent
        ? "missing_durable_ingestion"
        : "eligible_not_sent",
    };
  }

  if (!verifyDropbox) {
    const breezyStageOk = breezyStageLooksCorrect(
      item.breezyStage,
      item.paperworkStatus,
      item.paperworkStatus === "signed",
    );
    return {
      verified: Boolean(signatureRequestId) && workflowPaperworkSent,
      signatureRequestId,
      signerEmailMatch: null,
      packetStatus: "verify_skipped",
      packetCancelledOrInvalid: false,
      workflowPaperworkSent,
      breezyStageOk,
      source,
      detail: "Dropbox verify skipped (verifyDropbox=false); local signatureRequestId present.",
      reclassifiedTo: null,
    };
  }

  try {
    const summary = await getSignatureRequest(signatureRequestId);
    const cancelledOrInvalid =
      summary.isDeclined ||
      /cancel/i.test(summary.rawStatus) ||
      summary.rawStatus === "error";
    const signerEmails = summary.signatures.map((s) => s.signerEmail);
    const signerEmailMatch =
      !item.email ||
      signerEmails.some((e) => emailsMatch(e, item.email)) ||
      (onboarding?.email ? emailsMatch(onboarding.email, item.email) : false);

    const breezyStageOk = breezyStageLooksCorrect(
      item.workflowStage || item.breezyStage,
      item.paperworkStatus,
      summary.isComplete,
    );

    const verified =
      !cancelledOrInvalid &&
      Boolean(summary.signatureRequestId) &&
      (signerEmailMatch || !item.email);

    let reclassifiedTo: P244DispositionCategory | null = null;
    if (!verified) {
      if (cancelledOrInvalid) reclassifiedTo = "eligible_not_sent";
      else if (!signerEmailMatch) reclassifiedTo = "other_blocked";
      else reclassifiedTo = "missing_durable_ingestion";
    }

    return {
      verified,
      signatureRequestId: summary.signatureRequestId,
      signerEmailMatch,
      packetStatus: summary.rawStatus,
      packetCancelledOrInvalid: cancelledOrInvalid,
      workflowPaperworkSent: workflowPaperworkSent || summary.isComplete,
      breezyStageOk,
      source,
      detail: verified
        ? `Verified Dropbox packet ${summary.signatureRequestId.slice(0, 12)}… status=${summary.rawStatus}`
        : `Invalid/unverified packet: status=${summary.rawStatus} emailMatch=${signerEmailMatch}`,
      reclassifiedTo,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Local ID present but Dropbox lookup failed — keep as already_sent only if known prior + ID
    const keep =
      item.knownPriorSend ||
      Boolean(workflowSig) ||
      Boolean(onboardingSig);
    return {
      verified: keep,
      signatureRequestId,
      signerEmailMatch: null,
      packetStatus: "lookup_error",
      packetCancelledOrInvalid: null,
      workflowPaperworkSent,
      breezyStageOk: workflowPaperworkSent,
      source,
      detail: `Dropbox lookup error (${message}); ${keep ? "keeping already_sent on local signature evidence" : "reclassify"}`,
      reclassifiedTo: keep ? null : "missing_durable_ingestion",
    };
  }
}

export async function buildOnboardingSigIndex(): Promise<
  Map<string, { signatureRequestId: string; email: string | null }>
> {
  const records = await listAllCandidateOnboardingRecords();
  const map = new Map<string, { signatureRequestId: string; email: string | null }>();
  for (const rec of records) {
    const sig = String(rec.signatureRequestId ?? "").trim();
    if (!sig) continue;
    if (rec.status === "failed" || rec.status === "declined" || rec.status === "expired") continue;
    if (map.has(rec.candidateId)) continue;
    map.set(rec.candidateId, {
      signatureRequestId: sig,
      email: (rec as { candidateEmail?: string | null }).candidateEmail ?? null,
    });
  }
  return map;
}

export async function verifyAlreadySentCohort(input: {
  items: P243OsbpqQueueItem[];
  verifyDropbox?: boolean;
}): Promise<{
  byCandidateId: Map<string, P244SendVerification>;
  notes: string[];
}> {
  const notes: string[] = [];
  const verifyDropbox = input.verifyDropbox !== false;
  const onboardingIndex = await buildOnboardingSigIndex();
  const byCandidateId = new Map<string, P244SendVerification>();

  let verified = 0;
  let reclassified = 0;
  for (const item of input.items) {
    if (byCandidateId.has(item.candidateId)) continue;
    const result = await verifyPriorSend({
      item,
      onboardingSigByCandidate: onboardingIndex,
      verifyDropbox,
    });
    byCandidateId.set(item.candidateId, result);
    if (result.verified) verified += 1;
    if (result.reclassifiedTo) reclassified += 1;
  }

  notes.push(
    `Verified ${verified}/${byCandidateId.size} already_sent candidate(s); reclassified ${reclassified} lacking valid signature evidence.`,
  );
  return { byCandidateId, notes };
}
