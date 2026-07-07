import type { P1582BlockerClass, P1582BlockerCode } from "@/lib/p158-post-assignment-outcome-diagnosis/types";

const CLASS_BY_CODE: Record<P1582BlockerCode, P1582BlockerClass> = {
  duplicate: "true_business_requirement",
  invalid_email: "true_business_requirement",
  project_closed: "true_business_requirement",
  active_signature_request: "true_business_requirement",
  already_sent: "true_business_requirement",
  already_contacted_cooldown: "true_business_requirement",
  workflow_state_issue: "artificial_workflow_gate",
  missing_questionnaire: "safe_to_automate",
  missing_resume: "remain_manual_review",
  low_confidence: "remain_manual_review",
  operational_fit_mismatch: "remain_manual_review",
  other: "remain_manual_review",
};

export function classifyBlocker(code: P1582BlockerCode): P1582BlockerClass {
  return CLASS_BY_CODE[code];
}

export function isAutomatableBlocker(code: P1582BlockerCode, blockerClass: P1582BlockerClass): boolean {
  if (blockerClass === "safe_to_automate" || blockerClass === "artificial_workflow_gate") return true;
  if (code === "missing_questionnaire") return true;
  return false;
}
