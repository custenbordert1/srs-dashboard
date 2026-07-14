import {
  P187_FROM_STATE,
  P187_TO_STATE,
  type P187CandidateResult,
  type P187CandidateSnapshot,
} from "@/lib/p187-hr-to-oa-canary/types";

/** Production statuses that must never appear as a canary outcome. */
export const P187_FORBIDDEN_AFTER_STATUSES = [
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
] as const;

/**
 * Map production-ish fields into P186 lifecycle labels for the canary gate.
 * Does not mutate production.
 */
export function mapToLifecycleState(input: {
  workflowStatus: string;
  recommendedStage?: string | null;
  hasOperatorApprovalEvidence?: boolean;
}): string {
  const status = input.workflowStatus;
  if (P187_FORBIDDEN_AFTER_STATUSES.includes(status as (typeof P187_FORBIDDEN_AFTER_STATUSES)[number])) {
    if (status === "Paperwork Needed" && !input.hasOperatorApprovalEvidence) {
      return "PAPERWORK_NEEDED";
    }
    if (status === "Paperwork Needed") return "PAPERWORK_NEEDED";
    if (status === "Paperwork Sent") return "PAPERWORK_SENT";
    if (status === "Signed") return "SIGNED";
    if (status === "Ready for MEL" || status === "Loaded in MEL") return "READY_FOR_MEL";
    return "BEYOND_OPERATOR_APPROVED";
  }

  if (status === "Operator Approved" || input.hasOperatorApprovalEvidence) {
    return P187_TO_STATE;
  }

  const recommended = (input.recommendedStage ?? "").toLowerCase();
  if (
    recommended.includes("hire") ||
    recommended.includes("paperwork") ||
    recommended.includes("recommend")
  ) {
    return P187_FROM_STATE;
  }

  if (status === "Qualified" || status === "Needs Review") {
    return "RECRUITER_REVIEW";
  }

  return status.toUpperCase().replace(/\s+/g, "_") || "UNKNOWN";
}

export function isEligibleForCanary(snapshot: P187CandidateSnapshot): {
  ok: boolean;
  reason: string;
} {
  if (snapshot.lifecycleBefore !== P187_FROM_STATE) {
    return {
      ok: false,
      reason: `Expected lifecycle ${P187_FROM_STATE}, got ${snapshot.lifecycleBefore}`,
    };
  }
  if (snapshot.expectedLifecycleAfter !== P187_TO_STATE) {
    return { ok: false, reason: "Expected after-state must be OPERATOR_APPROVED" };
  }
  return { ok: true, reason: "Eligible" };
}

export function detectInvalidAdvancement(productionAfter: string | null): boolean {
  if (!productionAfter) return false;
  return P187_FORBIDDEN_AFTER_STATUSES.includes(
    productionAfter as (typeof P187_FORBIDDEN_AFTER_STATUSES)[number],
  );
}

/**
 * Simulated / injectable production adapter for HR → OA.
 * Production write: approval evidence note ONLY — never Paperwork Needed+.
 */
export type P187ProductionAdapter = (input: {
  candidateId: string;
  actor: string;
  correlationId: string;
  productionBefore: string;
}) => Promise<{
  ok: boolean;
  productionAfter: string;
  lifecycleAfter: typeof P187_TO_STATE;
  auditId: string;
  detail: string;
}>;

/**
 * Default adapter used in dry-run / tests — does not call the production workflow store write API.
 * Real production wiring remains behind executeProductionCanary gates.
 */
export const dryRunProductionAdapter: P187ProductionAdapter = async (input) => {
  return {
    ok: true,
    productionAfter: input.productionBefore, // status unchanged; approval evidence only
    lifecycleAfter: P187_TO_STATE,
    auditId: `dry-run-${input.correlationId}-${input.candidateId}`,
    detail: "Dry-run: would attach operator-approval evidence without advancing past Operator Approved",
  };
};

export function evaluateCandidateOutcome(input: {
  snapshot: P187CandidateSnapshot;
  productionAfter: string | null;
  lifecycleAfter: string | null;
  priorTransitionCount?: number;
}): Omit<P187CandidateResult, "ok" | "auditId" | "detail"> & {
  mismatch: boolean;
  duplicateTransition: boolean;
  skippedTransition: boolean;
  invalidStateChange: boolean;
} {
  const duplicateTransition = (input.priorTransitionCount ?? 0) > 0;
  const skippedTransition =
    input.lifecycleAfter == null ||
    (input.snapshot.lifecycleBefore === P187_FROM_STATE &&
      input.lifecycleAfter !== P187_TO_STATE &&
      input.lifecycleAfter !== P187_FROM_STATE &&
      input.lifecycleAfter !== "OPERATOR_APPROVED");

  // Skipped: still at HIRING_RECOMMENDATION after attempt means skip
  const trulySkipped =
    input.lifecycleAfter === P187_FROM_STATE || input.lifecycleAfter == null;

  const invalidStateChange = detectInvalidAdvancement(input.productionAfter);
  const mismatch =
    input.lifecycleAfter !== P187_TO_STATE ||
    invalidStateChange ||
    duplicateTransition;

  return {
    candidateId: input.snapshot.candidateId,
    productionBefore: input.snapshot.productionBefore,
    productionAfter: input.productionAfter,
    lifecycleBefore: input.snapshot.lifecycleBefore,
    lifecycleAfter: input.lifecycleAfter,
    p186Expected: P187_TO_STATE,
    mismatch,
    duplicateTransition,
    skippedTransition: trulySkipped || skippedTransition,
    invalidStateChange,
  };
}
