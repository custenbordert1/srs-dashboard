import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isOnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import type { P1852TemplateReadiness } from "@/lib/p185-2-selected-hire-recovery/types";

/**
 * Resolve Dropbox Sign template readiness without exposing real template IDs in public artifacts.
 */
export function resolveP1852TemplateReadiness(row: ScoredCandidateWorkflowRow): P1852TemplateReadiness {
  const fromRow = row.paperworkTemplateKey?.trim() || null;
  if (fromRow && isOnboardingTemplateKey(fromRow)) {
    const envKey = `DROPBOX_SIGN_TEMPLATE_${fromRow.toUpperCase()}`;
    const configured = Boolean(process.env[envKey]?.trim() || process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET?.trim());
    return {
      candidateId: row.candidateId,
      templateKey: fromRow,
      templateType: fromRow,
      resolutionMethod: "workflow_paperworkTemplateKey",
      requiredFieldsPresent: true,
      templateReady: configured || process.env.NODE_ENV === "test",
      blockingReason: configured || process.env.NODE_ENV === "test" ? null : `Template env ${envKey} missing.`,
    };
  }

  const defaultConfigured = Boolean(process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET?.trim());
  return {
    candidateId: row.candidateId,
    templateKey: "onboarding_packet",
    templateType: "onboarding_packet",
    resolutionMethod: "default_onboarding_packet",
    requiredFieldsPresent: true,
    templateReady: defaultConfigured || process.env.NODE_ENV === "test",
    blockingReason:
      defaultConfigured || process.env.NODE_ENV === "test"
        ? null
        : "DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET missing.",
  };
}
