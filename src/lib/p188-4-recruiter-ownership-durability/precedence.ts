import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { RecruiterAssignmentSource } from "@/lib/candidate-workflow-types";
import type {
  P1884ConflictClass,
  P1884OwnershipDecision,
  P1884OwnershipSource,
} from "@/lib/p188-4-recruiter-ownership-durability/types";

/**
 * Authoritative ownership precedence (P262 / P188.4).
 * Higher number wins. Equal priority resolves by newer assignedAt / ownershipVersion.
 *
 * 1. Confirmed operator assignment — manual, operator_restore,
 *    operator_confirmed_historical_restore
 * 2. Approved automated assignment — production_assignment, internal_assignment
 * 3. Breezy-sourced — breezy_import
 * 4. Workflow-restored — durable merge preferring fresher disk/incoming ownership
 *    (mechanism; not a lower write source that loses to Breezy)
 * 5. Inferred/default — auto, territory_default
 * 6. Unassigned fallback — unassigned
 */
export const OWNERSHIP_SOURCE_PRIORITY: Record<P1884OwnershipSource, number> = {
  manual: 100,
  operator_restore: 95,
  operator_confirmed_historical_restore: 95,
  production_assignment: 80,
  internal_assignment: 70,
  breezy_import: 50,
  auto: 40,
  territory_default: 40,
  unassigned: 0,
};

/** Human-readable precedence band for audits / activity (no internals). */
export function ownershipPrecedenceBand(
  source: RecruiterAssignmentSource | P1884OwnershipSource | string | null | undefined,
): string {
  switch (normalizeOwnershipSource(source)) {
    case "manual":
    case "operator_restore":
    case "operator_confirmed_historical_restore":
      return "Confirmed operator";
    case "production_assignment":
    case "internal_assignment":
      return "Approved automated";
    case "breezy_import":
      return "Breezy-sourced";
    case "auto":
    case "territory_default":
      return "Inferred/default";
    default:
      return "Unassigned";
  }
}

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

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Equal-priority freshness: higher ownershipVersion wins; else newer assignedAt wins.
 * Returns 1 if incoming is fresher, -1 if existing is fresher, 0 if tied/unknown.
 */
export function compareOwnershipFreshness(input: {
  incomingAssignedAt?: string | null;
  existingAssignedAt?: string | null;
  incomingOwnershipVersion?: number | null;
  existingOwnershipVersion?: number | null;
}): -1 | 0 | 1 {
  const existingVersion = input.existingOwnershipVersion ?? 0;
  const incomingVersion = input.incomingOwnershipVersion ?? 0;
  if (incomingVersion > existingVersion) return 1;
  if (incomingVersion < existingVersion) return -1;

  const existingAt = parseIsoMs(input.existingAssignedAt);
  const incomingAt = parseIsoMs(input.incomingAssignedAt);
  if (incomingAt != null && existingAt != null) {
    if (incomingAt > existingAt) return 1;
    if (incomingAt < existingAt) return -1;
  }
  // Prefer a side that has a timestamp over one that does not.
  if (incomingAt != null && existingAt == null) return 1;
  if (incomingAt == null && existingAt != null) return -1;
  return 0;
}

/**
 * Decide durable recruiter after an incoming write attempt.
 * Unassigned/null/empty never overwrite named.
 * Lower-priority sources never overwrite higher-priority named owners.
 * Equal-priority stale must never overwrite a newer confirmed write.
 */
export function decideOwnershipWrite(input: {
  incomingRecruiter?: string | null;
  incomingSource?: RecruiterAssignmentSource | P1884OwnershipSource | string | null;
  existingRecruiter?: string | null;
  existingSource?: RecruiterAssignmentSource | P1884OwnershipSource | string | null;
  incomingAssignedAt?: string | null;
  existingAssignedAt?: string | null;
  incomingOwnershipVersion?: number | null;
  existingOwnershipVersion?: number | null;
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
    const freshness = compareOwnershipFreshness({
      incomingAssignedAt: input.incomingAssignedAt,
      existingAssignedAt: input.existingAssignedAt,
      incomingOwnershipVersion: input.incomingOwnershipVersion,
      existingOwnershipVersion: input.existingOwnershipVersion,
    });

    if (freshness > 0) {
      return {
        recruiter: incomingTrimmed,
        source: incomingSource,
        applied: true,
        blocked: false,
        reason: `Equal-priority ${incomingSource}: newer confirmed write applied`,
        conflictClass: null,
      };
    }

    return {
      recruiter: existingName,
      source: existingSource,
      applied: false,
      blocked: true,
      reason:
        freshness < 0
          ? `Equal-priority stale ${incomingSource} cannot overwrite newer confirmed write`
          : `Equal-priority conflict (${existingSource}): preserving current`,
      conflictClass: freshness < 0 ? "stale_assignment" : "conflicting_history",
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

/** Operator-safe activity message for a rejected ownership write (no internals). */
export function formatOwnershipConflictActivity(input: {
  candidateLabel?: string;
  attemptedRecruiter: string;
  attemptedSource?: string | null;
  existingRecruiter: string;
  existingSource?: string | null;
  attemptedAt?: string | null;
  existingAt?: string | null;
  reason: string;
}): string {
  const attemptedBand = ownershipPrecedenceBand(input.attemptedSource);
  const existingBand = ownershipPrecedenceBand(input.existingSource);
  const attemptedWhen = input.attemptedAt ? ` at ${input.attemptedAt}` : "";
  const existingWhen = input.existingAt ? ` at ${input.existingAt}` : "";
  return (
    `Ownership conflict retained ${input.existingRecruiter} (${existingBand}${existingWhen}); ` +
    `rejected ${input.attemptedRecruiter} (${attemptedBand}${attemptedWhen}). ${input.reason}`
  );
}
