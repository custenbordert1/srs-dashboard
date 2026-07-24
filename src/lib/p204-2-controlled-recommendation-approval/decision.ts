import type {
  P2042EvidenceChecklist,
  P2042OperatorDecisionKind,
  P2042OperatorDecisionRecord,
  P2042ReviewPackage,
} from "@/lib/p204-2-controlled-recommendation-approval/types";

export const FULL_EVIDENCE_CHECKLIST: P2042EvidenceChecklist = {
  questionnaire: true,
  resumeOrExperience: true,
  contactDetails: true,
  duplicateIndicators: true,
  nearbyWork: true,
  hardGates: true,
};

const OVERRIDE_KINDS: P2042OperatorDecisionKind[] = [
  "override_to_advance",
  "override_to_review",
  "override_to_reject",
];

export function isOverrideDecision(kind: P2042OperatorDecisionKind): boolean {
  return OVERRIDE_KINDS.includes(kind);
}

export function isAgreementDecision(kind: P2042OperatorDecisionKind): boolean {
  return (
    kind === "agree_advance" || kind === "agree_review" || kind === "agree_reject"
  );
}

export function decidedOutcomeFromDecision(
  kind: P2042OperatorDecisionKind,
): P2042OperatorDecisionRecord["decidedOutcome"] {
  switch (kind) {
    case "agree_advance":
    case "override_to_advance":
      return "Advance";
    case "agree_review":
    case "override_to_review":
      return "Needs Recruiter Review";
    case "agree_reject":
    case "override_to_reject":
      return "Reject";
    case "defer":
      return "Deferred";
    case "stale_insufficient_evidence":
      return "Stale";
  }
}

export function evidenceChecklistComplete(
  checklist: P2042EvidenceChecklist,
): boolean {
  return (
    checklist.questionnaire &&
    checklist.resumeOrExperience &&
    checklist.contactDetails &&
    checklist.duplicateIndicators &&
    checklist.nearbyWork &&
    checklist.hardGates
  );
}

export function validateOperatorDecisionInput(input: {
  pkg: P2042ReviewPackage;
  decision: P2042OperatorDecisionKind;
  overrideReason?: string | null;
  evidenceChecklist: P2042EvidenceChecklist;
}): { ok: true } | { ok: false; error: string } {
  if (input.pkg.stale && input.decision !== "stale_insufficient_evidence") {
    return {
      ok: false,
      error: "stale_candidate_must_use_stale_decision",
    };
  }
  if (!input.pkg.stale && input.decision === "stale_insufficient_evidence") {
    return {
      ok: false,
      error: "stale_decision_requires_stale_candidate",
    };
  }
  if (isOverrideDecision(input.decision)) {
    const reason = (input.overrideReason ?? "").trim();
    if (!reason) {
      return { ok: false, error: "override_reason_required" };
    }
  }
  if (
    input.decision !== "stale_insufficient_evidence" &&
    !evidenceChecklistComplete(input.evidenceChecklist)
  ) {
    return { ok: false, error: "evidence_checklist_incomplete" };
  }

  const ai = input.pkg.aiRecommendation;
  if (input.decision === "agree_advance" && ai !== "Advance") {
    return { ok: false, error: "agree_advance_requires_ai_advance" };
  }
  if (input.decision === "agree_review" && ai !== "Needs Recruiter Review") {
    return { ok: false, error: "agree_review_requires_ai_review" };
  }
  if (input.decision === "agree_reject" && ai !== "Reject") {
    return { ok: false, error: "agree_reject_requires_ai_reject" };
  }

  return { ok: true };
}

/** Reject one-click bulk approval that skips per-candidate evidence. */
export function validateBatchFinalization(input: {
  packages: P2042ReviewPackage[];
  decisionsByCandidateId: Map<string, P2042OperatorDecisionKind>;
  checklistsByCandidateId: Map<string, P2042EvidenceChecklist>;
}): { ok: true } | { ok: false; error: string; missing: string[] } {
  const missing: string[] = [];
  for (const pkg of input.packages) {
    if (pkg.stale) {
      const d = input.decisionsByCandidateId.get(pkg.candidateId);
      if (d !== "stale_insufficient_evidence") {
        missing.push(`${pkg.redactedCandidateId}:stale_not_marked`);
      }
      continue;
    }
    if (!input.decisionsByCandidateId.has(pkg.candidateId)) {
      missing.push(`${pkg.redactedCandidateId}:no_decision`);
      continue;
    }
    const checklist = input.checklistsByCandidateId.get(pkg.candidateId);
    if (!checklist || !evidenceChecklistComplete(checklist)) {
      missing.push(`${pkg.redactedCandidateId}:checklist_incomplete`);
    }
  }
  if (missing.length > 0) {
    return { ok: false, error: "bulk_bypass_blocked", missing };
  }
  return { ok: true };
}

export function buildDecisionRecord(input: {
  pkg: P2042ReviewPackage;
  cohortId: string;
  fingerprint: string;
  decision: P2042OperatorDecisionKind;
  overrideReason?: string | null;
  reviewNotes?: string | null;
  evidenceChecklist: P2042EvidenceChecklist;
  operatorId: string;
  decidedAt?: string;
}): P2042OperatorDecisionRecord {
  const validation = validateOperatorDecisionInput({
    pkg: input.pkg,
    decision: input.decision,
    overrideReason: input.overrideReason,
    evidenceChecklist: input.evidenceChecklist,
  });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return {
    candidateId: input.pkg.candidateId,
    redactedCandidateId: input.pkg.redactedCandidateId,
    cohortId: input.cohortId,
    fingerprint: input.fingerprint,
    aiRecommendation: input.pkg.aiRecommendation,
    confidence: input.pkg.confidence,
    decision: input.decision,
    decidedOutcome: decidedOutcomeFromDecision(input.decision),
    isAgreement: isAgreementDecision(input.decision),
    isOverride: isOverrideDecision(input.decision),
    overrideReason: isOverrideDecision(input.decision)
      ? (input.overrideReason ?? "").trim()
      : null,
    reviewNotes: input.reviewNotes ?? null,
    evidenceChecklist: input.evidenceChecklist,
    operatorId: input.operatorId,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
    safetyFlags: input.pkg.safetyFlags,
    staleReasons: input.pkg.staleReasons,
  };
}

export function parseNearestMiles(signal: string): number | null {
  const m = signal.match(/nearest~(\d+(?:\.\d+)?)mi/i);
  if (!m) return null;
  return Number(m[1]);
}
