import type {
  P1865ChecklistItem,
  P1865ChecklistRequirementId,
} from "@/lib/p186-5-post-sign-mel-queue/types";
import { P186_5_CHECKLIST_VERSION } from "@/lib/p186-5-post-sign-mel-queue/types";

export type ChecklistInput = {
  signedOnboardingAgreement?: boolean;
  i9Complete?: boolean | "na";
  taxFormsComplete?: boolean | "na";
  directDepositStatus?: "complete" | "incomplete" | "na" | "unknown";
  identificationDocument?: boolean | "na";
  clientSpecificForms?: boolean | "na";
  stateSpecificForms?: boolean | "na";
  workerClassification?: boolean | "na";
  policyAcknowledgments?: boolean | "na";
  trainingAcknowledgments?: boolean | "na";
  source?: string;
  verifiedAt?: string | null;
};

function item(
  requirementId: P1865ChecklistRequirementId,
  status: P1865ChecklistItem["completionStatus"],
  source: string,
  verifiedAt: string | null,
  blockerReason: string | null,
): P1865ChecklistItem {
  return {
    requirementId,
    completionStatus: status,
    source,
    verifiedAt: status === "complete" ? verifiedAt : null,
    redactedReference: status === "complete" ? `ref:${requirementId}` : null,
    blockerReason,
  };
}

function fromBool(
  requirementId: P1865ChecklistRequirementId,
  value: boolean | "na" | undefined,
  source: string,
  verifiedAt: string | null,
  label: string,
): P1865ChecklistItem {
  if (value === "na") return item(requirementId, "not_applicable", source, verifiedAt, null);
  if (value === true) return item(requirementId, "complete", source, verifiedAt, null);
  if (value === false) {
    return item(requirementId, "incomplete", source, null, `Missing ${label}`);
  }
  return item(requirementId, "unknown", source, null, `Unknown ${label}`);
}

/**
 * Configurable onboarding checklist — stores status metadata only, never raw documents.
 */
export function buildOnboardingChecklist(input: ChecklistInput): {
  version: string;
  items: P1865ChecklistItem[];
  completionPct: number;
  missing: string[];
} {
  const source = input.source ?? "production_observe";
  const verifiedAt = input.verifiedAt ?? new Date().toISOString();
  const dd = input.directDepositStatus ?? "unknown";

  const items: P1865ChecklistItem[] = [
    fromBool(
      "signed_onboarding_agreement",
      input.signedOnboardingAgreement,
      source,
      verifiedAt,
      "signed onboarding agreement",
    ),
    fromBool("i9_completion", input.i9Complete, source, verifiedAt, "I-9"),
    fromBool("tax_form_completion", input.taxFormsComplete, source, verifiedAt, "tax forms"),
    item(
      "direct_deposit_status",
      dd === "complete"
        ? "complete"
        : dd === "na"
          ? "not_applicable"
          : dd === "incomplete"
            ? "incomplete"
            : "unknown",
      source,
      dd === "complete" ? verifiedAt : null,
      dd === "complete" || dd === "na" ? null : "Direct deposit incomplete",
    ),
    fromBool(
      "identification_document",
      input.identificationDocument,
      source,
      verifiedAt,
      "identification document",
    ),
    fromBool(
      "client_specific_forms",
      input.clientSpecificForms,
      source,
      verifiedAt,
      "client-specific forms",
    ),
    fromBool(
      "state_specific_forms",
      input.stateSpecificForms,
      source,
      verifiedAt,
      "state-specific forms",
    ),
    fromBool(
      "worker_classification",
      input.workerClassification,
      source,
      verifiedAt,
      "worker classification",
    ),
    fromBool(
      "policy_acknowledgments",
      input.policyAcknowledgments,
      source,
      verifiedAt,
      "policy acknowledgments",
    ),
    fromBool(
      "training_acknowledgments",
      input.trainingAcknowledgments,
      source,
      verifiedAt,
      "training acknowledgments",
    ),
  ];

  const applicable = items.filter((i) => i.completionStatus !== "not_applicable");
  const complete = applicable.filter((i) => i.completionStatus === "complete");
  const missing = applicable
    .filter((i) => i.completionStatus === "incomplete" || i.completionStatus === "unknown")
    .map((i) => i.requirementId);
  const completionPct =
    applicable.length === 0 ? 100 : Math.round((complete.length / applicable.length) * 100);

  return {
    version: P186_5_CHECKLIST_VERSION,
    items,
    completionPct,
    missing,
  };
}
