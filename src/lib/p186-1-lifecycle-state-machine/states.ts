import {
  P186_HAPPY_PATH_ORDER,
  type P186LifecycleState,
} from "@/lib/p186-1-lifecycle-state-machine/types";

/**
 * Legal directed edges for P186.1.
 * BLOCKED can be entered from any non-terminal state and left to RECRUITER_REVIEW or prior.
 * VIEWED is optional between SENT and SIGNED.
 */
export const P186_LEGAL_TRANSITIONS: ReadonlyMap<
  P186LifecycleState,
  ReadonlySet<P186LifecycleState>
> = new Map([
  ["APPLIED", new Set(["RECRUITER_REVIEW", "BLOCKED"])],
  [
    "RECRUITER_REVIEW",
    new Set(["HIRING_RECOMMENDATION", "BLOCKED"]),
  ],
  [
    "HIRING_RECOMMENDATION",
    new Set(["OPERATOR_APPROVED", "RECRUITER_REVIEW", "BLOCKED"]),
  ],
  [
    "OPERATOR_APPROVED",
    new Set(["PAPERWORK_NEEDED", "RECRUITER_REVIEW", "BLOCKED"]),
  ],
  ["PAPERWORK_NEEDED", new Set(["PAPERWORK_SENT", "BLOCKED"])],
  ["PAPERWORK_SENT", new Set(["VIEWED", "SIGNED", "BLOCKED"])],
  ["VIEWED", new Set(["SIGNED", "BLOCKED"])],
  ["SIGNED", new Set(["ONBOARDING_COMPLETE", "BLOCKED"])],
  ["ONBOARDING_COMPLETE", new Set(["READY_FOR_MEL", "BLOCKED"])],
  ["READY_FOR_MEL", new Set(["EXPORTED", "BLOCKED"])],
  ["EXPORTED", new Set<P186LifecycleState>()],
  [
    "BLOCKED",
    new Set([
      "APPLIED",
      "RECRUITER_REVIEW",
      "HIRING_RECOMMENDATION",
      "OPERATOR_APPROVED",
      "PAPERWORK_NEEDED",
      "PAPERWORK_SENT",
      "VIEWED",
      "SIGNED",
      "ONBOARDING_COMPLETE",
      "READY_FOR_MEL",
    ]),
  ],
]);

export function happyPathIndex(state: P186LifecycleState): number {
  return P186_HAPPY_PATH_ORDER.indexOf(state as (typeof P186_HAPPY_PATH_ORDER)[number]);
}

export function isForwardProgress(
  from: P186LifecycleState | null,
  to: P186LifecycleState,
): boolean {
  if (to === "BLOCKED") return true;
  if (from == null) return true;
  if (from === "BLOCKED") return true;
  const a = happyPathIndex(from);
  const b = happyPathIndex(to);
  if (a < 0 || b < 0) return from !== to;
  return b >= a;
}

export function isLegalTransition(
  from: P186LifecycleState | null,
  to: P186LifecycleState,
): boolean {
  if (from == null) {
    return to === "APPLIED" || to === "BLOCKED";
  }
  if (from === to) return false;
  const allowed = P186_LEGAL_TRANSITIONS.get(from);
  return Boolean(allowed?.has(to));
}

/**
 * Derive expected lifecycle state from production workflow facts.
 * Observational only — does not mutate production.
 */
export function deriveExpectedLifecycleState(input: {
  workflowStatus: string | null;
  paperworkStatus: string | null;
  paperworkSentAt: string | null;
  paperworkViewedAt: string | null;
  paperworkSignedAt: string | null;
  signatureRequestId: string | null;
  recommendedStage: string | null;
  hasOperatorApprovalEvidence?: boolean;
  directDepositStatus?: string | null;
}): P186LifecycleState {
  const status = (input.workflowStatus ?? "").trim();
  const paperwork = (input.paperworkStatus ?? "").toLowerCase();
  const hasPacket =
    Boolean(input.signatureRequestId) ||
    Boolean(input.paperworkSentAt) ||
    paperwork === "sent" ||
    paperwork === "viewed" ||
    paperwork === "signed";

  if (status === "Loaded in MEL" || status === "Active Rep") return "EXPORTED";
  if (status === "Ready for MEL") return "READY_FOR_MEL";
  if (status === "Awaiting DD Verification") return "ONBOARDING_COMPLETE";

  if (
    status === "Signed" ||
    paperwork === "signed" ||
    Boolean(input.paperworkSignedAt)
  ) {
    if (
      input.directDepositStatus === "verified" ||
      input.directDepositStatus === "not_required"
    ) {
      return "ONBOARDING_COMPLETE";
    }
    return "SIGNED";
  }

  if (paperwork === "viewed" || Boolean(input.paperworkViewedAt)) {
    return "VIEWED";
  }

  if (status === "Paperwork Sent" || hasPacket) {
    return "PAPERWORK_SENT";
  }

  if (status === "Paperwork Needed") {
    if (input.hasOperatorApprovalEvidence) return "PAPERWORK_NEEDED";
    // Production often lands on Paperwork Needed after approval — treat as PAPERWORK_NEEDED
    // when status is already Paperwork Needed; OPERATOR_APPROVED is a shadow pre-state.
    return "PAPERWORK_NEEDED";
  }

  if (status === "Not Qualified") return "BLOCKED";

  if (
    input.hasOperatorApprovalEvidence &&
    (status === "Qualified" || status === "Needs Review" || status === "Applied")
  ) {
    return "OPERATOR_APPROVED";
  }

  const recommended = (input.recommendedStage ?? "").toLowerCase();
  if (
    recommended.includes("hire") ||
    recommended.includes("paperwork") ||
    recommended.includes("recommend")
  ) {
    return "HIRING_RECOMMENDATION";
  }

  if (status === "Needs Review" || status === "Qualified") {
    return "RECRUITER_REVIEW";
  }

  return "APPLIED";
}
