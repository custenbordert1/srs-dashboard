import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  decideOwnershipWrite,
  normalizeOwnershipSource,
} from "@/lib/p188-4-recruiter-ownership-durability/precedence";

/**
 * Merge sticky ownership when concurrent writers race on full-file rewrite.
 * Named + higher-priority ownership always wins over Unassigned/lower.
 */
export function mergeOwnershipSticky(
  disk: CandidateWorkflowRecord,
  incoming: CandidateWorkflowRecord,
): CandidateWorkflowRecord {
  const decision = decideOwnershipWrite({
    incomingRecruiter: incoming.assignedRecruiter,
    incomingSource: incoming.recruiterAssignmentSource,
    existingRecruiter: disk.assignedRecruiter,
    existingSource: disk.recruiterAssignmentSource,
  });

  const ownershipVersion = Math.max(
    disk.recruiterOwnershipVersion ?? 0,
    incoming.recruiterOwnershipVersion ?? 0,
  );

  // If disk had named and incoming tried Unassigned, keep disk ownership fields.
  const preferDiskOwnership =
    decision.blocked ||
    (decision.recruiter === disk.assignedRecruiter &&
      !isUnassignedRecruiter(disk.assignedRecruiter));

  return {
    ...incoming,
    assignedRecruiter: decision.recruiter,
    recruiterAssignmentSource: preferDiskOwnership
      ? disk.recruiterAssignmentSource ??
        (decision.source as CandidateWorkflowRecord["recruiterAssignmentSource"])
      : (incoming.recruiterAssignmentSource ??
        (decision.source as CandidateWorkflowRecord["recruiterAssignmentSource"])),
    recruiterAssignedAt: preferDiskOwnership
      ? disk.recruiterAssignedAt ?? incoming.recruiterAssignedAt
      : incoming.recruiterAssignedAt ?? disk.recruiterAssignedAt,
    recruiterAssignmentConfidence: preferDiskOwnership
      ? disk.recruiterAssignmentConfidence ?? incoming.recruiterAssignmentConfidence
      : incoming.recruiterAssignmentConfidence ?? disk.recruiterAssignmentConfidence,
    recruiterAssignmentReason: preferDiskOwnership
      ? disk.recruiterAssignmentReason ?? incoming.recruiterAssignmentReason
      : incoming.recruiterAssignmentReason ?? disk.recruiterAssignmentReason,
    recruiterOwnershipVersion: ownershipVersion,
  };
}

export function mergeWorkflowMapsForDurableWrite(
  disk: Record<string, CandidateWorkflowRecord>,
  incoming: Record<string, CandidateWorkflowRecord>,
): Record<string, CandidateWorkflowRecord> {
  const out: Record<string, CandidateWorkflowRecord> = { ...disk };
  for (const [id, rec] of Object.entries(incoming)) {
    const existing = out[id];
    out[id] = existing ? mergeOwnershipSticky(existing, rec) : rec;
  }
  return out;
}

export function assertOwnershipCas(input: {
  existing: CandidateWorkflowRecord | undefined;
  expectedOwnershipVersion?: number | null;
  expectedRecruiter?: string | null;
}): { ok: true } | { ok: false; detail: string } {
  if (input.expectedOwnershipVersion != null && input.existing) {
    const current = input.existing.recruiterOwnershipVersion ?? 0;
    if (current !== input.expectedOwnershipVersion) {
      return {
        ok: false,
        detail: `ownership version conflict: expected ${input.expectedOwnershipVersion} got ${current}`,
      };
    }
  }
  if (input.expectedRecruiter != null && input.existing) {
    const current = input.existing.assignedRecruiter ?? "Unassigned";
    if (current !== input.expectedRecruiter) {
      return {
        ok: false,
        detail: `ownership recruiter conflict: expected ${input.expectedRecruiter} got ${current}`,
      };
    }
  }
  void normalizeOwnershipSource;
  return { ok: true };
}
