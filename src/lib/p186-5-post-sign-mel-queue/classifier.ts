import { buildOnboardingChecklist, type ChecklistInput } from "@/lib/p186-5-post-sign-mel-queue/checklist";
import { isSignedStatus, verifySignedPaperwork } from "@/lib/p186-5-post-sign-mel-queue/signedVerification";
import type {
  P1865PostSignEvent,
  P1865QueueId,
  P1865ReadinessClassification,
  P1865ReadinessState,
} from "@/lib/p186-5-post-sign-mel-queue/types";

export type ClassifyInput = {
  event: P1865PostSignEvent;
  productionState?: string | null;
  shadowState?: string | null;
  expectedTemplateKey?: string | null;
  productionRecordExists?: boolean;
  withdrawn?: boolean;
  archived?: boolean;
  onboardingAssignmentValid?: boolean;
  duplicateEnvelopeConflict?: boolean;
  alreadyExported?: boolean;
  melExportBlocked?: boolean;
  checklist?: ChecklistInput;
  operatorHold?: boolean;
};

function queueFor(state: P1865ReadinessState): P1865QueueId | null {
  switch (state) {
    case "paperwork_signed_complete":
    case "paperwork_signed_needs_review":
      return "signed_ready_onboarding_validation";
    case "paperwork_signed_missing_documents":
      return "signed_missing_documents";
    case "paperwork_signed_conflicting_state":
    case "duplicate_envelope_conflict":
      return "signed_conflicting";
    case "ready_for_mel_review":
      return "ready_for_mel_review";
    case "mel_export_blocked":
      return "mel_export_blocked";
    case "already_exported":
      return "already_exported";
    case "identity_unresolved":
    case "onboarding_assignment_invalid":
      return "post_sign_reconciliation_exceptions";
    default:
      return null;
  }
}

function actionFor(state: P1865ReadinessState): string {
  switch (state) {
    case "paperwork_signed_complete":
      return "Approve onboarding completion (authorized production path)";
    case "paperwork_signed_missing_documents":
      return "Request missing documents";
    case "paperwork_signed_needs_review":
      return "Operator review signed paperwork";
    case "paperwork_signed_conflicting_state":
      return "Investigate production/shadow conflict";
    case "ready_for_mel_review":
      return "Approve Ready for MEL (authorized path)";
    case "mel_export_blocked":
      return "Resolve MEL export blockers";
    case "already_exported":
      return "No action — already exported";
    case "declined_or_canceled":
      return "Handle declined/canceled paperwork";
    case "duplicate_envelope_conflict":
      return "Resolve duplicate envelope";
    case "identity_unresolved":
      return "Resolve candidate identity";
    case "onboarding_assignment_invalid":
      return "Repair onboarding assignment";
    case "paperwork_not_signed":
      return "Wait for signature — do not advance";
    default:
      return "No action";
  }
}

/**
 * Classify each candidate into exactly one readiness state.
 */
export function classifyOnboardingReadiness(input: ClassifyInput): P1865ReadinessClassification {
  const checklist = buildOnboardingChecklist({
    signedOnboardingAgreement: isSignedStatus(input.event.envelopeStatus),
    ...input.checklist,
    source: input.event.sourceSystem,
    verifiedAt: input.event.at,
  });

  const base = {
    candidateId: input.event.candidateId ?? "unknown",
    productionState: input.productionState ?? null,
    shadowState: input.shadowState ?? null,
    envelopeStatus: input.event.envelopeStatus,
    checklistCompletionPct: checklist.completionPct,
    missingRequirements: checklist.missing,
    sourceTimestamps: {
      eventAt: input.event.at,
      signedAt: isSignedStatus(input.event.envelopeStatus) ? input.event.at : null,
    },
  };

  const finish = (
    state: P1865ReadinessState,
    blockers: string[],
    confidence: number,
  ): P1865ReadinessClassification => ({
    ...base,
    state,
    blockers,
    recommendedAction: actionFor(state),
    confidence,
    queueId: queueFor(state),
  });

  if (!input.event.candidateId) {
    return finish("identity_unresolved", ["Candidate identity unresolved"], 0.95);
  }
  if (input.alreadyExported || input.productionState === "Loaded in MEL") {
    return finish("already_exported", [], 0.99);
  }
  if (input.event.declinedOrCanceled) {
    return finish("declined_or_canceled", ["Declined or canceled"], 0.99);
  }
  if (input.duplicateEnvelopeConflict) {
    return finish("duplicate_envelope_conflict", ["Duplicate envelope"], 0.95);
  }
  if (input.onboardingAssignmentValid === false) {
    return finish("onboarding_assignment_invalid", ["Onboarding assignment invalid"], 0.95);
  }

  const verification = verifySignedPaperwork({
    event: input.event,
    expectedCandidateId: input.event.candidateId,
    expectedTemplateKey: input.expectedTemplateKey,
    productionRecordExists: input.productionRecordExists ?? true,
    withdrawn: input.withdrawn,
    archived: input.archived,
    onboardingAssignmentValid: input.onboardingAssignmentValid,
    duplicateEnvelopeConflict: input.duplicateEnvelopeConflict,
    allRequiredSignersCompleted: input.event.requiredSignersCompleted ?? undefined,
    allRequiredFieldsPresent: input.event.requiredFieldsPresent ?? undefined,
  });

  if (!isSignedStatus(input.event.envelopeStatus)) {
    return finish("paperwork_not_signed", verification.blockers, 0.99);
  }

  if (verification.codes.includes("identity_mismatch") || verification.codes.includes("identity_unresolved")) {
    return finish("identity_unresolved", verification.blockers, 0.95);
  }

  if (!verification.ok && verification.codes.some((c) => c !== "missing_fields")) {
    // signed but blocked by structural issues → conflicting / needs review
    if (verification.codes.includes("duplicate_envelope")) {
      return finish("duplicate_envelope_conflict", verification.blockers, 0.95);
    }
    if (verification.codes.includes("assignment_invalid")) {
      return finish("onboarding_assignment_invalid", verification.blockers, 0.95);
    }
  }

  const prod = (input.productionState ?? "").toLowerCase();
  const shadow = (input.shadowState ?? "").toUpperCase();
  if (
    (prod.includes("paperwork sent") || prod.includes("paperwork needed")) &&
    isSignedStatus(input.event.envelopeStatus)
  ) {
    // signed envelope vs stale production — conflicting unless we're classifying post-sign intake
    if (shadow && shadow !== "SIGNED" && shadow !== "ONBOARDING_COMPLETE" && shadow !== "READY_FOR_MEL" && shadow !== "VIEWED" && shadow !== "PAPERWORK_SENT") {
      return finish("paperwork_signed_conflicting_state", [
        `Production "${input.productionState}" conflicts with signed envelope`,
      ], 0.85);
    }
  }

  if (input.melExportBlocked || input.operatorHold) {
    return finish("mel_export_blocked", input.operatorHold ? ["Onboarding hold"] : ["MEL export blocked"], 0.9);
  }

  if (checklist.missing.length > 0) {
    return finish("paperwork_signed_missing_documents", checklist.missing, 0.9);
  }

  if (
    prod === "ready for mel" ||
    shadow === "READY_FOR_MEL" ||
    (checklist.completionPct === 100 && (prod.includes("awaiting dd") || shadow === "ONBOARDING_COMPLETE"))
  ) {
    if (checklist.completionPct < 100) {
      return finish("mel_export_blocked", ["Ready for MEL without completed checklist"], 0.92);
    }
    return finish("ready_for_mel_review", [], 0.93);
  }

  if (checklist.completionPct === 100 && verification.ok) {
    return finish("paperwork_signed_complete", [], 0.94);
  }

  if (isSignedStatus(input.event.envelopeStatus)) {
    return finish(
      verification.ok ? "paperwork_signed_needs_review" : "paperwork_signed_needs_review",
      verification.blockers,
      0.8,
    );
  }

  return finish("no_action", [], 0.5);
}
