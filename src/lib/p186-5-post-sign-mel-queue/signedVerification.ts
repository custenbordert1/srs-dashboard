import type {
  P1865PostSignEvent,
  P1865SignedVerificationResult,
} from "@/lib/p186-5-post-sign-mel-queue/types";

export type SignedVerificationContext = {
  event: P1865PostSignEvent;
  expectedCandidateId: string;
  expectedTemplateKey?: string | null;
  productionRecordExists: boolean;
  withdrawn?: boolean;
  archived?: boolean;
  onboardingAssignmentValid?: boolean;
  duplicateEnvelopeConflict?: boolean;
  allRequiredSignersCompleted?: boolean;
  allRequiredFieldsPresent?: boolean;
};

function isSignedStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase().trim();
  return s === "signed" || s === "completed" || s === "all_signed" || s === "signature_request_all_signed";
}

function isViewedOrSentOnly(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase().trim();
  return s === "viewed" || s === "sent" || s === "not_sent" || s === "awaiting_signature";
}

/**
 * Verify signed paperwork before proposing advancement.
 * Viewed/sent envelopes must never count as signed.
 */
export function verifySignedPaperwork(
  ctx: SignedVerificationContext,
): P1865SignedVerificationResult {
  const blockers: string[] = [];
  const codes: string[] = [];
  const status = ctx.event.envelopeStatus;

  if (isViewedOrSentOnly(status) || !isSignedStatus(status)) {
    if (!isSignedStatus(status)) {
      blockers.push(`Envelope status "${status ?? "(empty)"}" is not signed/completed`);
      codes.push("not_signed");
    }
  }
  if (ctx.event.declinedOrCanceled) {
    blockers.push("Envelope declined or canceled");
    codes.push("declined_or_canceled");
  }
  if (ctx.event.expiredOrFailed) {
    blockers.push("Envelope expired or failed");
    codes.push("expired_or_failed");
  }
  if (ctx.event.candidateId !== ctx.expectedCandidateId) {
    blockers.push("Envelope candidate does not match expected candidate");
    codes.push("identity_mismatch");
  }
  if (
    ctx.expectedTemplateKey &&
    ctx.event.templateKey &&
    ctx.event.templateKey !== ctx.expectedTemplateKey
  ) {
    blockers.push("Envelope template mismatch");
    codes.push("template_mismatch");
  }
  const signersOk =
    ctx.allRequiredSignersCompleted ?? ctx.event.requiredSignersCompleted ?? false;
  if (!signersOk) {
    blockers.push("Missing required signer completion");
    codes.push("missing_signer");
  }
  const fieldsOk =
    ctx.allRequiredFieldsPresent ?? ctx.event.requiredFieldsPresent ?? false;
  if (!fieldsOk) {
    blockers.push("Required fields incomplete");
    codes.push("missing_fields");
  }
  if (ctx.duplicateEnvelopeConflict) {
    blockers.push("Duplicate envelope conflict");
    codes.push("duplicate_envelope");
  }
  if (ctx.withdrawn) {
    blockers.push("Candidate withdrawn");
    codes.push("withdrawn");
  }
  if (ctx.archived) {
    blockers.push("Candidate archived");
    codes.push("archived");
  }
  if (!ctx.expectedCandidateId?.trim()) {
    blockers.push("Candidate identity unresolved");
    codes.push("identity_unresolved");
  }
  if (!ctx.productionRecordExists) {
    blockers.push("Production workflow record missing");
    codes.push("production_missing");
  }
  if (ctx.onboardingAssignmentValid === false) {
    blockers.push("Onboarding assignment invalid");
    codes.push("assignment_invalid");
  }

  return { ok: blockers.length === 0, blockers, codes };
}

export { isSignedStatus, isViewedOrSentOnly };
