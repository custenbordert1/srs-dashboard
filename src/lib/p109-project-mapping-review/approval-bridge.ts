import type { MappingDecision } from "@/lib/p108-intelligent-project-mapping/types";
import type {
  MappingApprovalStatus,
  P109ReviewDecision,
  P109ReviewDecisionRecord,
  ReviewWorkflowSafetyStatus,
} from "@/lib/p109-project-mapping-review/types";
import type { PaperworkBlockerCategory } from "@/lib/p106-autonomous-paperwork-engine/types";

const PROTECTION_BLOCKERS = new Set<PaperworkBlockerCategory>([
  "already_sent",
  "invalid_email",
  "duplicate_risk",
]);

export function resolveMappingApprovalStatus(input: {
  candidateId: string;
  mappingDecision: MappingDecision;
  record?: P109ReviewDecisionRecord | null;
}): MappingApprovalStatus {
  if (input.record) {
    return input.record.decision;
  }
  if (input.mappingDecision === "AUTO_MAP") {
    return "approved";
  }
  return "pending";
}

export function buildApprovalBridgeIndex(input: {
  recommendations: Array<{ candidateId: string; mappingDecision: MappingDecision }>;
  records: P109ReviewDecisionRecord[];
}): {
  approved: string[];
  rejected: string[];
  skipped: string[];
  pending: string[];
} {
  const recordsByCandidate = new Map(input.records.map((r) => [r.candidateId, r]));
  const approved: string[] = [];
  const rejected: string[] = [];
  const skipped: string[] = [];
  const pending: string[] = [];

  for (const rec of input.recommendations) {
    const status = resolveMappingApprovalStatus({
      candidateId: rec.candidateId,
      mappingDecision: rec.mappingDecision,
      record: recordsByCandidate.get(rec.candidateId),
    });
    if (status === "approved") approved.push(rec.candidateId);
    else if (status === "rejected") rejected.push(rec.candidateId);
    else if (status === "skipped") skipped.push(rec.candidateId);
    else pending.push(rec.candidateId);
  }

  return { approved, rejected, skipped, pending };
}

export function isIdentifiedAsApproved(status: MappingApprovalStatus): boolean {
  return status === "approved";
}

export function isRejectedMapping(status: MappingApprovalStatus): boolean {
  return status === "rejected";
}

export function isSkippedOrPending(status: MappingApprovalStatus): boolean {
  return status === "skipped" || status === "pending";
}

/** Unapproved REVIEW candidates must not be trusted for runner mapping recovery. */
export function unapprovedReviewBlocksRunnerTrust(input: {
  mappingDecision: MappingDecision;
  approvalStatus: MappingApprovalStatus;
}): boolean {
  if (input.mappingDecision !== "REVIEW") return false;
  return input.approvalStatus !== "approved";
}

export function isTrustedLocalApproval(input: {
  mappingDecision: MappingDecision;
  approvalStatus: MappingApprovalStatus;
}): boolean {
  if (input.mappingDecision === "AUTO_MAP") return true;
  if (input.mappingDecision === "REVIEW" && input.approvalStatus === "approved") return true;
  return false;
}

/** Protection blockers always win over mapping approval. */
export function protectionBlockerOverridesApproval(blockerCategory: PaperworkBlockerCategory): boolean {
  return PROTECTION_BLOCKERS.has(blockerCategory);
}

export function p109DecisionFromAction(action: "approve" | "reject" | "skip"): P109ReviewDecision {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  return "skipped";
}

export function buildSafetyStatus(): ReviewWorkflowSafetyStatus {
  return {
    p1063RunnerUnchanged: true,
    noBreezyWrites: true,
    noLiveSends: true,
    noAutoPaperworkFromReview: true,
    unapprovedReviewBlocked: true,
    protectionOrderPreserved: true,
  };
}
