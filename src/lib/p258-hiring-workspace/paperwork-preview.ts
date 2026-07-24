import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";
import { ONBOARDING_TEMPLATE_REGISTRY } from "@/lib/onboarding-template-registry";
import type {
  HiringEligibilityPanel,
  HiringWorkspaceApplicantRow,
  PaperworkPreviewModel,
} from "@/lib/p258-hiring-workspace/types";

function templateLabel(key: string): string {
  if (key in ONBOARDING_TEMPLATE_REGISTRY) {
    return ONBOARDING_TEMPLATE_REGISTRY[key as OnboardingTemplateKey].label;
  }
  return key;
}

/**
 * Build a preview-only Send Paperwork model.
 * Never triggers Dropbox Sign / production send APIs.
 */
export function buildPaperworkPreviewModel(
  applicant: HiringWorkspaceApplicantRow,
  eligibility?: HiringEligibilityPanel,
): PaperworkPreviewModel {
  const panel = eligibility ?? applicant.eligibility;
  const templateKey =
    (panel.templateKey as OnboardingTemplateKey | null) ||
    applicant.paperworkTemplateKey ||
    "onboarding_packet";

  return {
    candidateId: applicant.candidateId,
    candidateName: applicant.displayName,
    recipientEmail: applicant.email || "(missing email)",
    templateKey,
    templateLabel: templateLabel(templateKey),
    eligibility: panel,
    action: "preview_only",
    liveSendWired: false,
    confirmLabel: "Confirm preview (no send)",
    warning:
      "P258 Send Paperwork is preview + confirmation only. Live Dropbox Sign send is not wired from this panel to prevent accidental production writes. Use Candidates workspace send after eligibility is green if a live send is required.",
    details: [
      { label: "Candidate", value: applicant.displayName },
      { label: "Recipient", value: applicant.email || "—" },
      { label: "Phone", value: applicant.phone || "—" },
      { label: "Template", value: templateLabel(templateKey) },
      { label: "Workflow stage", value: applicant.workflowStatus },
      { label: "Paperwork status", value: applicant.paperworkStatus },
      { label: "Eligibility", value: panel.verdict },
      {
        label: "Blocking reasons",
        value: panel.blockingReasons.length ? panel.blockingReasons.join("; ") : "None",
      },
      {
        label: "Needs attention",
        value: panel.attentionReasons.length ? panel.attentionReasons.join("; ") : "None",
      },
      { label: "Action", value: "preview_only (no production write)" },
    ],
  };
}
