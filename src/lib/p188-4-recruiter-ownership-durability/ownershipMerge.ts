import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  decideOwnershipWrite,
  formatOwnershipConflictActivity,
  normalizeOwnershipSource,
} from "@/lib/p188-4-recruiter-ownership-durability/precedence";
import type { P1884OwnershipDecision } from "@/lib/p188-4-recruiter-ownership-durability/types";

function isNamedDm(name: string | null | undefined): boolean {
  return Boolean(name?.trim() && name.trim().toLowerCase() !== "unassigned");
}

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Sticky DM merge: Unassigned never clobbers named; equal-priority uses fresher
 * dmAssignedAt / dmOwnershipVersion (P262).
 */
export function mergeDmOwnershipSticky(
  disk: CandidateWorkflowRecord,
  incoming: CandidateWorkflowRecord,
): Pick<
  CandidateWorkflowRecord,
  "assignedDM" | "dmAssignmentSource" | "dmAssignedAt" | "dmAssignedBy" | "dmOwnershipVersion"
> {
  const diskNamed = isNamedDm(disk.assignedDM);
  const incomingNamed = isNamedDm(incoming.assignedDM);
  const ownershipVersion = Math.max(disk.dmOwnershipVersion ?? 0, incoming.dmOwnershipVersion ?? 0);

  if (!incomingNamed && diskNamed) {
    return {
      assignedDM: disk.assignedDM,
      dmAssignmentSource: disk.dmAssignmentSource ?? null,
      dmAssignedAt: disk.dmAssignedAt ?? incoming.dmAssignedAt ?? null,
      dmAssignedBy: disk.dmAssignedBy ?? incoming.dmAssignedBy ?? null,
      dmOwnershipVersion: ownershipVersion,
    };
  }

  if (!diskNamed && incomingNamed) {
    return {
      assignedDM: incoming.assignedDM,
      dmAssignmentSource: incoming.dmAssignmentSource ?? null,
      dmAssignedAt: incoming.dmAssignedAt ?? disk.dmAssignedAt ?? null,
      dmAssignedBy: incoming.dmAssignedBy ?? disk.dmAssignedBy ?? null,
      dmOwnershipVersion: ownershipVersion,
    };
  }

  if (diskNamed && incomingNamed && disk.assignedDM.trim() !== incoming.assignedDM.trim()) {
    const diskVersion = disk.dmOwnershipVersion ?? 0;
    const incomingVersion = incoming.dmOwnershipVersion ?? 0;
    let preferIncoming = false;
    if (incomingVersion > diskVersion) preferIncoming = true;
    else if (incomingVersion < diskVersion) preferIncoming = false;
    else {
      const diskAt = parseIsoMs(disk.dmAssignedAt);
      const incomingAt = parseIsoMs(incoming.dmAssignedAt);
      if (incomingAt != null && diskAt != null) preferIncoming = incomingAt > diskAt;
      else if (incomingAt != null && diskAt == null) preferIncoming = true;
      else preferIncoming = false;
    }

    if (preferIncoming) {
      return {
        assignedDM: incoming.assignedDM,
        dmAssignmentSource: incoming.dmAssignmentSource ?? disk.dmAssignmentSource ?? null,
        dmAssignedAt: incoming.dmAssignedAt ?? disk.dmAssignedAt ?? null,
        dmAssignedBy: incoming.dmAssignedBy ?? disk.dmAssignedBy ?? null,
        dmOwnershipVersion: ownershipVersion,
      };
    }

    return {
      assignedDM: disk.assignedDM,
      dmAssignmentSource: disk.dmAssignmentSource ?? incoming.dmAssignmentSource ?? null,
      dmAssignedAt: disk.dmAssignedAt ?? incoming.dmAssignedAt ?? null,
      dmAssignedBy: disk.dmAssignedBy ?? incoming.dmAssignedBy ?? null,
      dmOwnershipVersion: ownershipVersion,
    };
  }

  // Same DM or both unassigned — prefer richer metadata from the fresher side.
  const preferIncomingMeta =
    (incoming.dmOwnershipVersion ?? 0) > (disk.dmOwnershipVersion ?? 0) ||
    (parseIsoMs(incoming.dmAssignedAt) ?? 0) > (parseIsoMs(disk.dmAssignedAt) ?? 0);

  return {
    assignedDM: incomingNamed ? incoming.assignedDM : disk.assignedDM || "Unassigned",
    dmAssignmentSource: preferIncomingMeta
      ? (incoming.dmAssignmentSource ?? disk.dmAssignmentSource ?? null)
      : (disk.dmAssignmentSource ?? incoming.dmAssignmentSource ?? null),
    dmAssignedAt: preferIncomingMeta
      ? (incoming.dmAssignedAt ?? disk.dmAssignedAt ?? null)
      : (disk.dmAssignedAt ?? incoming.dmAssignedAt ?? null),
    dmAssignedBy: preferIncomingMeta
      ? (incoming.dmAssignedBy ?? disk.dmAssignedBy ?? null)
      : (disk.dmAssignedBy ?? incoming.dmAssignedBy ?? null),
    dmOwnershipVersion: ownershipVersion,
  };
}

export type OwnershipMergeResult = {
  record: CandidateWorkflowRecord;
  decision: P1884OwnershipDecision;
  conflictActivity: string | null;
};

/**
 * Merge sticky ownership when concurrent writers race on full-file rewrite.
 * Named + higher-priority ownership always wins over Unassigned/lower.
 * Equal-priority uses fresher version/timestamp so confirmed writes stick.
 */
export function mergeOwnershipSticky(
  disk: CandidateWorkflowRecord,
  incoming: CandidateWorkflowRecord,
): CandidateWorkflowRecord {
  return mergeOwnershipStickyDetailed(disk, incoming).record;
}

export function mergeOwnershipStickyDetailed(
  disk: CandidateWorkflowRecord,
  incoming: CandidateWorkflowRecord,
): OwnershipMergeResult {
  const decision = decideOwnershipWrite({
    incomingRecruiter: incoming.assignedRecruiter,
    incomingSource: incoming.recruiterAssignmentSource,
    existingRecruiter: disk.assignedRecruiter,
    existingSource: disk.recruiterAssignmentSource,
    incomingAssignedAt: incoming.recruiterAssignedAt,
    existingAssignedAt: disk.recruiterAssignedAt,
    incomingOwnershipVersion: incoming.recruiterOwnershipVersion,
    existingOwnershipVersion: disk.recruiterOwnershipVersion,
  });

  const ownershipVersion = Math.max(
    disk.recruiterOwnershipVersion ?? 0,
    incoming.recruiterOwnershipVersion ?? 0,
  );

  const preferDiskOwnership =
    decision.blocked ||
    (decision.recruiter === disk.assignedRecruiter &&
      !isUnassignedRecruiter(disk.assignedRecruiter));

  const dm = mergeDmOwnershipSticky(disk, incoming);

  let conflictActivity: string | null = null;
  if (
    decision.blocked &&
    decision.conflictClass &&
    incoming.assignedRecruiter?.trim() &&
    !isUnassignedRecruiter(incoming.assignedRecruiter) &&
    disk.assignedRecruiter?.trim() &&
    disk.assignedRecruiter.trim() !== incoming.assignedRecruiter.trim()
  ) {
    conflictActivity = formatOwnershipConflictActivity({
      attemptedRecruiter: incoming.assignedRecruiter.trim(),
      attemptedSource: incoming.recruiterAssignmentSource,
      existingRecruiter: disk.assignedRecruiter.trim(),
      existingSource: disk.recruiterAssignmentSource,
      attemptedAt: incoming.recruiterAssignedAt,
      existingAt: disk.recruiterAssignedAt,
      reason: decision.reason,
    });
  }

  const record: CandidateWorkflowRecord = {
    ...incoming,
    ...dm,
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
    recruiterAssignedBy: preferDiskOwnership
      ? disk.recruiterAssignedBy ?? incoming.recruiterAssignedBy ?? null
      : incoming.recruiterAssignedBy ?? disk.recruiterAssignedBy ?? null,
    recruiterConfirmationStatus: preferDiskOwnership
      ? disk.recruiterConfirmationStatus ?? incoming.recruiterConfirmationStatus ?? null
      : incoming.recruiterConfirmationStatus ?? disk.recruiterConfirmationStatus ?? null,
    recruiterOwnershipVersion: ownershipVersion,
  };

  if (conflictActivity) {
    const history = [...(record.history ?? [])];
    const already = history.some((e) => e.message === conflictActivity);
    if (!already) {
      history.unshift({
        id: `own-conflict-${Date.now()}`,
        type: "assignment",
        message: conflictActivity,
        createdAt: new Date().toISOString(),
      });
      record.history = history.slice(0, 100);
    }
  }

  return { record, decision, conflictActivity };
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
