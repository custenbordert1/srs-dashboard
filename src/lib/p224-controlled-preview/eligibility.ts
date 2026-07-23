import { evaluateP214Gates } from "@/lib/p214-unsent-test-batch/eligibility";
import type { P214GateEvidence } from "@/lib/p214-unsent-test-batch/types";
import {
  P224_EXCLUDED_P221_IDS,
  P224_REQUIRED_PAPERWORK_STATUS,
  P224_REQUIRED_STAGE,
  type P224ExclusionReason,
  type P224PreviewCandidate,
} from "@/lib/p224-controlled-preview/types";
import { isP223TerminalWorkflowStage } from "@/lib/p223-recruiter-inbox-restoration";

const P221_SET = new Set<string>(P224_EXCLUDED_P221_IDS);

export function isP224ExcludedP221Candidate(candidateId: string): boolean {
  return P221_SET.has(candidateId);
}

export function isUnassignedDm(assignedDM: string | null | undefined): boolean {
  const value = String(assignedDM ?? "").trim();
  return !value || /^unassigned$/i.test(value);
}

export function hasUsableEmail(email: string | null | undefined): boolean {
  const value = String(email ?? "").trim();
  return value.includes("@") && value.length >= 5;
}

export function hasUsableIdentity(name: string | null | undefined): boolean {
  const value = String(name ?? "").trim();
  if (!value) return false;
  if (/^unknown(\s+candidate)?$/i.test(value)) return false;
  return value.split(/\s+/).filter(Boolean).length >= 1;
}

export type P224BaseEligibilityInput = {
  candidateId: string;
  inInboxUnion: boolean;
  workflowStatus: string;
  paperworkStatus: string;
  signatureRequestId: string | null | undefined;
  assignedDM: string | null | undefined;
  email: string | null | undefined;
  name: string | null | undefined;
};

/**
 * Structural eligibility before proximity/P214 gates.
 * Collects all blockers (no short-circuit) for audit reporting.
 */
export function evaluateP224BaseEligibility(
  input: P224BaseEligibilityInput,
): { ok: boolean; reasons: P224ExclusionReason[] } {
  const reasons: P224ExclusionReason[] = [];
  if (isP224ExcludedP221Candidate(input.candidateId)) reasons.push("p221_excluded");
  if (!input.inInboxUnion) reasons.push("not_in_inbox_union");
  if (String(input.workflowStatus) !== P224_REQUIRED_STAGE) {
    reasons.push("stage_not_paperwork_needed");
  }
  if (String(input.paperworkStatus) !== P224_REQUIRED_PAPERWORK_STATUS) {
    reasons.push("paperwork_already_sent");
  }
  if (String(input.signatureRequestId ?? "").trim()) {
    reasons.push("signature_request_present");
  }
  if (isUnassignedDm(input.assignedDM)) reasons.push("dm_unassigned_or_missing");
  if (!hasUsableEmail(input.email)) reasons.push("missing_email");
  if (!hasUsableIdentity(input.name)) reasons.push("missing_identity");
  if (isP223TerminalWorkflowStage(String(input.workflowStatus))) {
    reasons.push("terminal_or_inactive");
  }
  return { ok: reasons.length === 0, reasons };
}

export function evaluateP224ProximityGates(evidence: P214GateEvidence): {
  ok: boolean;
  blockers: string[];
  tier: ReturnType<typeof evaluateP214Gates>["tier"];
} {
  const gates = evaluateP214Gates(evidence);
  return {
    ok: gates.eligible,
    blockers: gates.blockers,
    tier: gates.tier,
  };
}

/** Defensive abort checks on a finalized selection. */
export function assertP224SelectionSafe(
  selected: P224PreviewCandidate[],
  maxSize: number,
): { ok: true } | { ok: false; reason: string; details: string[] } {
  const details: string[] = [];
  if (selected.length > maxSize) {
    details.push(`selected ${selected.length} exceeds max ${maxSize}`);
  }
  const seen = new Set<string>();
  for (const row of selected) {
    if (seen.has(row.candidateId)) {
      details.push(`duplicate candidateId ${row.candidateId}`);
    }
    seen.add(row.candidateId);
    if (isP224ExcludedP221Candidate(row.candidateId)) {
      details.push(`P221 candidate included: ${row.candidateId}`);
    }
    if (String(row.signatureRequestId ?? "").trim()) {
      details.push(`signature present: ${row.candidateId}`);
    }
    if (!hasUsableEmail(row.email)) {
      details.push(`missing email: ${row.candidateId}`);
    }
    if (row.eligibilityResult !== "eligible") {
      details.push(`ineligible selected: ${row.candidateId}`);
    }
    if (row.workflowStatus !== P224_REQUIRED_STAGE) {
      details.push(`wrong stage: ${row.candidateId}`);
    }
    if (row.paperworkStatus !== P224_REQUIRED_PAPERWORK_STATUS) {
      details.push(`wrong paperworkStatus: ${row.candidateId}`);
    }
    if (isUnassignedDm(row.assignedDM)) {
      details.push(`DM unassigned: ${row.candidateId}`);
    }
  }
  if (details.length > 0) {
    return { ok: false, reason: "selection_safety_abort", details };
  }
  return { ok: true };
}
