import { createHash } from "node:crypto";
import { mapToLifecycleState } from "@/lib/p187-hr-to-oa-canary/adapter";
import {
  P187_1_MAX_COHORT,
  type P1871CandidateObservation,
  type P1871EligibilityResult,
} from "@/lib/p187-1-canary-cohort-readiness/types";

const STALE_MS = 14 * 24 * 60 * 60 * 1000;

export function redactCandidateId(candidateId: string): string {
  const id = candidateId.trim();
  if (id.length <= 8) return `${id.slice(0, 2)}…${id.slice(-2)}`;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export function hashCandidateId(candidateId: string): string {
  return createHash("sha256").update(candidateId.trim()).digest("hex").slice(0, 12);
}

export function hasRecommendationEvidence(input: {
  recommendedStage?: string | null;
  recommendationEvidenceRef?: string | null;
}): boolean {
  if (input.recommendationEvidenceRef?.trim()) return true;
  const rec = (input.recommendedStage ?? "").toLowerCase();
  return (
    rec.includes("hire") ||
    rec.includes("recommend") ||
    rec.includes("paperwork") ||
    rec === "send paperwork" ||
    rec.includes("qualified")
  );
}

export function hasApprovalEvidence(input: {
  notes?: string[];
  hasOperatorApprovalEvidence?: boolean;
  progressionReason?: string | null;
}): boolean {
  if (input.hasOperatorApprovalEvidence) return true;
  if (/operator.?approved|p187_operator_approved/i.test(input.progressionReason ?? "")) {
    return true;
  }
  return (input.notes ?? []).some((n) =>
    /\[P190_OPERATOR_APPROVED\]|\[P187_OPERATOR_APPROVED\]|OPERATOR_APPROVED|operator approved/i.test(
      n,
    ),
  );
}

export function detectHolds(input: {
  notes?: string[];
  holdFlags?: string[];
  nextActionNeeded?: string | null;
}): string[] {
  const flags = [...(input.holdFlags ?? [])];
  for (const n of input.notes ?? []) {
    if (/\[HOLD\]|recruiter hold|dm hold|executive hold|client hold/i.test(n)) {
      flags.push(n.slice(0, 80));
    }
  }
  if (/on hold/i.test(input.nextActionNeeded ?? "")) flags.push("nextAction:on_hold");
  return [...new Set(flags)];
}

export function isStale(updatedAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!updatedAt) return true;
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return true;
  return nowMs - t > STALE_MS;
}

/**
 * Build observation + eligibility for HR → OA canary (read-only).
 */
export function evaluateCandidateEligibility(
  input: {
    candidateId: string;
    workflowStatus: string;
    recommendedStage?: string | null;
    notes?: string[];
    assignedRecruiter?: string | null;
    assignedDM?: string | null;
    withdrawn?: boolean;
    archived?: boolean;
    holdFlags?: string[];
    nextActionNeeded?: string | null;
    progressionReason?: string | null;
    hasOperatorApprovalEvidence?: boolean;
    shadowPresent?: boolean;
    shadowState?: string | null;
    lifecycleMismatch?: boolean;
    identityResolved?: boolean;
    jobAssignmentResolved?: boolean;
    jobAssignmentRef?: string | null;
    operatorOwner?: string | null;
    duplicateApprovalEvent?: boolean;
    conflictingOperation?: boolean;
    unresolvedAuditIssue?: boolean;
    rollbackStateAvailable?: boolean;
    recommendationEvidenceRef?: string | null;
    productionRecordVersion?: string;
    lastActionAt?: string | null;
    updatedAt?: string | null;
    nowMs?: number;
  },
): P1871EligibilityResult {
  const approval = hasApprovalEvidence(input);
  const lifecycleState = mapToLifecycleState({
    workflowStatus: input.workflowStatus,
    recommendedStage: input.recommendedStage,
    hasOperatorApprovalEvidence: approval,
  });

  const holds = detectHolds(input);
  const evidence =
    input.recommendationEvidenceRef?.trim() ||
    (hasRecommendationEvidence(input) ? `recommendedStage:${input.recommendedStage}` : null);

  const operatorOwner =
    input.operatorOwner?.trim() ||
    (input.assignedDM && input.assignedDM !== "Unassigned" ? input.assignedDM : null) ||
    (input.assignedRecruiter && input.assignedRecruiter !== "Unassigned"
      ? input.assignedRecruiter
      : null);

  const stale =
    input.updatedAt !== undefined
      ? isStale(input.updatedAt, input.nowMs)
      : Boolean(input.updatedAt === null);

  const observation: P1871CandidateObservation = {
    candidateId: input.candidateId,
    productionRecordVersion:
      input.productionRecordVersion ??
      `${input.updatedAt ?? "unknown"}:${input.workflowStatus}`,
    workflowStatus: input.workflowStatus,
    recommendedStage: input.recommendedStage ?? null,
    hasOperatorApprovalEvidence: approval,
    lifecycleState,
    shadowPresent: input.shadowPresent ?? true,
    shadowState: input.shadowState ?? lifecycleState,
    lifecycleMismatch:
      input.lifecycleMismatch ??
      (input.shadowState != null && input.shadowState !== lifecycleState),
    identityResolved: input.identityResolved ?? Boolean(input.candidateId.trim()),
    jobAssignmentResolved: input.jobAssignmentResolved ?? Boolean(input.jobAssignmentRef?.trim()),
    jobAssignmentRef: input.jobAssignmentRef ?? null,
    operatorOwnerResolved: Boolean(operatorOwner),
    operatorOwner,
    withdrawn: Boolean(input.withdrawn),
    archived: Boolean(input.archived),
    holdFlags: holds,
    duplicateApprovalEvent: Boolean(input.duplicateApprovalEvent),
    conflictingOperation: Boolean(input.conflictingOperation),
    staleProductionState: stale,
    unresolvedAuditIssue: Boolean(input.unresolvedAuditIssue),
    rollbackStateAvailable: input.rollbackStateAvailable ?? true,
    recommendationEvidenceRef: evidence,
    lastActionAt: input.lastActionAt ?? null,
    updatedAt: input.updatedAt ?? null,
  };

  const blocked: string[] = [];
  if (observation.lifecycleState !== "HIRING_RECOMMENDATION") {
    blocked.push(`lifecycleState=${observation.lifecycleState} (need HIRING_RECOMMENDATION)`);
  }
  if (!evidence) blocked.push("recommendation evidence missing");
  if (!observation.identityResolved) blocked.push("candidate identity unresolved");
  if (!observation.jobAssignmentResolved) blocked.push("job assignment unresolved");
  if (!observation.operatorOwnerResolved) blocked.push("operator owner unresolved");
  if (observation.withdrawn) blocked.push("withdrawn");
  if (observation.archived) blocked.push("archived");
  if (observation.holdFlags.length) blocked.push(`holds: ${observation.holdFlags.join(",")}`);
  if (observation.duplicateApprovalEvent) blocked.push("duplicate approval event");
  if (observation.conflictingOperation) blocked.push("active conflicting operation");
  if (observation.staleProductionState) blocked.push("stale production state");
  if (observation.lifecycleMismatch) blocked.push("lifecycle mismatch");
  if (!observation.shadowPresent) blocked.push("missing shadow record");
  if (observation.unresolvedAuditIssue) blocked.push("unresolved audit issue");
  if (!observation.rollbackStateAvailable) blocked.push("rollback state unavailable");
  if (observation.hasOperatorApprovalEvidence) {
    blocked.push("already has operator approval evidence");
  }

  return {
    candidateId: input.candidateId,
    eligible: blocked.length === 0,
    blockedReasons: blocked,
    observation,
  };
}

/**
 * Select up to max eligible candidates — never pad / never lower standards.
 */
export function selectEligibleCohort(
  results: P1871EligibilityResult[],
  max = P187_1_MAX_COHORT,
): {
  eligible: P1871EligibilityResult[];
  ineligible: P1871EligibilityResult[];
  truncated: boolean;
} {
  const eligibleAll = results.filter((r) => r.eligible);
  const ineligible = results.filter((r) => !r.eligible);
  const eligible = eligibleAll.slice(0, max);
  return {
    eligible,
    ineligible,
    truncated: eligibleAll.length > max,
  };
}
