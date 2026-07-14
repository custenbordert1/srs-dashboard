import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { RecruiterAssignmentSource } from "@/lib/candidate-workflow-types";
import type {
  P1884ConflictClass,
  P1884OwnershipDecision,
  P1884OwnershipSource,
} from "@/lib/p188-4-recruiter-ownership-durability/types";

/**
 * Assignment source priority (higher wins).
 * 1 manual → 2 operator_restore → 3 production → 4 internal →
 * 5 breezy_import → 6 auto/territory → 7 unassigned
 */
export const OWNERSHIP_SOURCE_PRIORITY: Record<P1884OwnershipSource, number> = {
  manual: 100,
  operator_restore: 90,
  operator_confirmed_historical_restore: 90,
  production_assignment: 80,
  internal_assignment: 70,
  breezy_import: 50,
  auto: 40,
  territory_default: 40,
  unassigned: 0,
};

export function normalizeOwnershipSource(
  source: RecruiterAssignmentSource | P1884OwnershipSource | string | null | undefined,
): P1884OwnershipSource {
  switch (source) {
    case "manual":
      return "manual";
    case "operator_restore":
      return "operator_restore";
    case "operator_confirmed_historical_restore":
      return "operator_confirmed_historical_restore";
    case "production_assignment":
      return "production_assignment";
    case "internal_assignment":
      return "internal_assignment";
    case "breezy_import":
      return "breezy_import";
    case "auto":
      return "auto";
    case "territory_default":
      return "territory_default";
    default:
      return "unassigned";
  }
}

export function ownershipPriority(
  source: RecruiterAssignmentSource | P1884OwnershipSource | string | null | undefined,
): number {
  return OWNERSHIP_SOURCE_PRIORITY[normalizeOwnershipSource(source)];
}

function isNamed(name: string | null | undefined): name is string {
  return Boolean(name?.trim() && !isUnassignedRecruiter(name));
}

/**
 * Decide durable recruiter after an incoming write attempt.
 * Unassigned/null/empty never overwrite named.
 * Lower-priority sources never overwrite higher-priority named owners.
 */
export function decideOwnershipWrite(input: {
  incomingRecruiter?: string | null;
  incomingSource?: RecruiterAssignmentSource | P1884OwnershipSource | string | null;
  existingRecruiter?: string | null;
  existingSource?: RecruiterAssignmentSource | P1884OwnershipSource | string | null;
  /** Explicit force (operator/manual reassignment of a protected owner). */
  allowForceOverwrite?: boolean;
}): P1884OwnershipDecision {
  const existingNamed = isNamed(input.existingRecruiter);
  const incomingTrimmed = input.incomingRecruiter?.trim() ?? "";
  const incomingNamed = isNamed(incomingTrimmed);
  const existingSource = normalizeOwnershipSource(input.existingSource);
  const incomingSource = normalizeOwnershipSource(
    incomingNamed ? input.incomingSource : "unassigned",
  );

  // Missing/Unassigned incoming → preserve existing
  if (!incomingNamed) {
    if (existingNamed) {
      return {
        recruiter: input.existingRecruiter!.trim(),
        source: existingSource === "unassigned" ? null : existingSource,
        applied: false,
        blocked: true,
        reason: "Unassigned/empty incoming cannot overwrite named recruiter",
        conflictClass: "current_assignment_protected",
      };
    }
    return {
      recruiter: "Unassigned",
      source: null,
      applied: true,
      blocked: false,
      reason: "No named ownership; remains Unassigned",
      conflictClass: null,
    };
  }

  // No existing named → accept incoming
  if (!existingNamed) {
    return {
      recruiter: incomingTrimmed,
      source: incomingSource,
      applied: true,
      blocked: false,
      reason: `Applied ownership from ${incomingSource}`,
      conflictClass: null,
    };
  }

  const existingName = input.existingRecruiter!.trim();
  if (existingName === incomingTrimmed) {
    // Same owner — allow source upgrade if higher priority
    const keepSource =
      ownershipPriority(incomingSource) >= ownershipPriority(existingSource)
        ? incomingSource
        : existingSource;
    return {
      recruiter: existingName,
      source: keepSource,
      applied: ownershipPriority(incomingSource) > ownershipPriority(existingSource),
      blocked: false,
      reason: "Same recruiter retained",
      conflictClass: null,
    };
  }

  if (input.allowForceOverwrite) {
    return {
      recruiter: incomingTrimmed,
      source: incomingSource,
      applied: true,
      blocked: false,
      reason: "Forced explicit reassignment",
      conflictClass: null,
    };
  }

  const existingPri = ownershipPriority(existingSource);
  const incomingPri = ownershipPriority(incomingSource);

  if (incomingPri > existingPri) {
    return {
      recruiter: incomingTrimmed,
      source: incomingSource,
      applied: true,
      blocked: false,
      reason: `Higher-priority ${incomingSource} overwrote ${existingSource}`,
      conflictClass: null,
    };
  }

  if (incomingPri === existingPri && incomingPri > 0) {
    return {
      recruiter: existingName,
      source: existingSource,
      applied: false,
      blocked: true,
      reason: `Equal-priority conflict (${existingSource}): preserving current`,
      conflictClass: "conflicting_history",
    };
  }

  return {
    recruiter: existingName,
    source: existingSource,
    applied: false,
    blocked: true,
    reason: `Lower-priority ${incomingSource} cannot overwrite ${existingSource}`,
    conflictClass: "current_assignment_protected",
  };
}

export function classifyConflict(decision: P1884OwnershipDecision): P1884ConflictClass | null {
  return decision.conflictClass;
}
