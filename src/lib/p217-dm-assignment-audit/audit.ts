import type {
  P217CandidateAuditInput,
  P217GlobalAuditRow,
  P217GlobalSummary,
  P217RootCause,
} from "@/lib/p217-dm-assignment-audit/types";

export function isP217DmUnassigned(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim();
  return !normalized || /^unassigned$/i.test(normalized);
}

export function isP217ActiveWorkflowStage(stage: string): boolean {
  return stage.trim() !== "Not Qualified";
}

/**
 * Root-cause precedence is evidence based:
 * reset → territory → map → explicit manual gate → sync mismatch → engine gap.
 */
export function classifyP217RootCause(input: P217CandidateAuditInput): P217RootCause {
  if (!isP217DmUnassigned(input.previousAssignedDm) && isP217DmUnassigned(input.assignedDm)) {
    return "Workflow Reset";
  }
  if (!input.territory.trim()) return "Territory Missing";
  if (!input.expectedDm.trim()) return "DM Lookup Failure";
  if (input.manualReviewRequired) return "Manual Assignment Required";
  if (
    input.syncSuppliedDm &&
    !isP217DmUnassigned(input.syncSuppliedDm) &&
    isP217DmUnassigned(input.assignedDm)
  ) {
    return "Sync Failure";
  }
  if (
    input.positionLookupSucceeded &&
    input.positionLocationAuthoritative &&
    isP217DmUnassigned(input.assignedDm)
  ) {
    return "Assignment Engine Failure";
  }
  return "Unknown";
}

export function isP217AutomaticallyAssignable(input: P217CandidateAuditInput): boolean {
  return (
    isP217ActiveWorkflowStage(input.workflowStage) &&
    isP217DmUnassigned(input.assignedDm) &&
    input.positionLookupSucceeded &&
    input.positionLocationAuthoritative &&
    Boolean(input.territory.trim() && input.expectedDm.trim()) &&
    !input.manualReviewRequired
  );
}

function increment(target: Record<string, number>, rawKey: string): void {
  const key = rawKey.trim() || "Unknown";
  target[key] = (target[key] ?? 0) + 1;
}

export function summarizeP217GlobalAudit(rows: P217GlobalAuditRow[]): P217GlobalSummary {
  const active = rows.filter((row) => isP217ActiveWorkflowStage(row.workflowStage));
  const unassigned = active.filter((row) => isP217DmUnassigned(row.assignedDm));
  const unassignedByStage: Record<string, number> = {};
  const unassignedByTerritory: Record<string, number> = {};
  const unassignedByRecruiter: Record<string, number> = {};

  for (const row of unassigned) {
    increment(unassignedByStage, row.workflowStage);
    increment(unassignedByTerritory, row.territory);
    increment(unassignedByRecruiter, row.assignedRecruiter);
  }

  return {
    totalActiveCandidates: active.length,
    totalAssignedDm: active.length - unassigned.length,
    totalUnassignedDm: unassigned.length,
    unassignedByStage,
    unassignedByTerritory,
    unassignedByRecruiter,
    automaticallyAssignable: unassigned.filter((row) => row.autoAssignable).length,
  };
}

export function p217ExpectedDmAccuracy(
  rows: Array<{ expectedDm: string; actualMappedDm: string }>,
): { verified: number; correct: number; accuracyPct: number } {
  const verified = rows.filter((row) => row.expectedDm.trim());
  const correct = verified.filter(
    (row) => row.expectedDm.trim().toLowerCase() === row.actualMappedDm.trim().toLowerCase(),
  ).length;
  return {
    verified: verified.length,
    correct,
    accuracyPct: verified.length === 0 ? 0 : Math.round((correct / verified.length) * 1000) / 10,
  };
}
