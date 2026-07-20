import {
  P214_AUTHORIZED_STAGES,
  type P214CandidateEvidence,
  type P214Classification,
} from "@/lib/p214-unsent-test-batch/types";

/**
 * Classify a candidate's prior-send history. Precedence is strictest-first so
 * a candidate with any envelope evidence can never come out UNSENT_CONFIRMED.
 * Coverage / DM / posting gates are applied separately (eligibility.ts).
 */
export function classifyP214SendHistory(e: P214CandidateEvidence): P214Classification {
  const status = e.dropboxEnvelopeStatus;
  if (status === "complete" || status === "partially_signed") return "signed";
  if (e.paperworkStatus === "signed" || e.workflowStatus === "Signed") return "signed";
  if (status === "viewed") return "viewed";
  if (e.paperworkStatus === "viewed") return "viewed";
  if (
    status === "pending" ||
    status === "declined" ||
    status === "cancelled" ||
    status === "expired"
  ) {
    return "pending_envelope";
  }
  if (
    e.hasSignatureRequestId ||
    e.hasPaperworkSentAt ||
    e.hasActiveOnboardingEnvelope ||
    e.paperworkStatus === "sent" ||
    e.workflowStatus === "Paperwork Sent"
  ) {
    return "previously_sent_workflow";
  }
  if (e.inPriorSendLedger) return "prior_cohort_member";
  if (e.isDuplicateIdentity) return "duplicate_identity";
  if (e.alreadyPlaced) return "already_placed";
  if (!e.hasName || !isValidNormalizedEmail(e.normalizedEmail)) return "missing_contact_info";
  if (!P214_AUTHORIZED_STAGES.has(e.workflowStatus)) return "stage_not_authorized";
  return "UNSENT_CONFIRMED";
}

export function isValidNormalizedEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function normalizeP214Email(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

export type P214IdentityInput = {
  candidateId: string;
  normalizedEmail: string;
  /** Earlier = kept. ISO timestamp; empty sorts last. */
  approvedAt: string;
  stageAuthorized: boolean;
};

/**
 * Collapse same-person multiple applications by normalized email. Keeps one
 * record per identity (prefer stage-authorized, then oldest approvedAt, then
 * lowest candidateId for determinism); every other record with the same email
 * is a duplicate.
 */
export function collapseDuplicateIdentities(
  candidates: P214IdentityInput[],
): { keptIds: Set<string>; duplicateIds: Set<string> } {
  const byEmail = new Map<string, P214IdentityInput[]>();
  const keptIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const c of candidates) {
    if (!c.normalizedEmail) {
      keptIds.add(c.candidateId);
      continue;
    }
    const list = byEmail.get(c.normalizedEmail) ?? [];
    list.push(c);
    byEmail.set(c.normalizedEmail, list);
  }

  for (const group of byEmail.values()) {
    const sorted = [...group].sort((a, b) => {
      if (a.stageAuthorized !== b.stageAuthorized) return a.stageAuthorized ? -1 : 1;
      const at = a.approvedAt || "9999";
      const bt = b.approvedAt || "9999";
      if (at !== bt) return at < bt ? -1 : 1;
      return a.candidateId < b.candidateId ? -1 : 1;
    });
    keptIds.add(sorted[0]!.candidateId);
    for (const dup of sorted.slice(1)) duplicateIds.add(dup.candidateId);
  }

  return { keptIds, duplicateIds };
}
