import {
  isAuthoritativeBreezyLocationSource,
  resolveAuthoritativePostingGeography,
} from "@/lib/p216-position-location-authority";
import type {
  P218AssignmentDecision,
  P218AssignmentInput,
  P218Reason,
  P218Summary,
} from "@/lib/p218-automatic-dm-assignment/types";

const INACTIVE_WORKFLOW_STAGES = new Set([
  "Not Qualified",
  "Active Rep",
  "Loaded in MEL",
]);
const ARCHIVED_CANDIDATE_STAGES = new Set([
  "archived",
  "disqualified",
  "withdrawn",
  "rejected",
]);

export function isP218Unassigned(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim();
  return !normalized || /^unassigned$/i.test(normalized);
}

export function isP218WorkflowActive(stage: string): boolean {
  return !INACTIVE_WORKFLOW_STAGES.has(stage.trim());
}

export function isP218CandidateArchived(stage: string): boolean {
  return ARCHIVED_CANDIDATE_STAGES.has(stage.trim().toLowerCase());
}

function unable(
  input: P218AssignmentInput,
  reason: P218Reason,
  partial: Partial<P218AssignmentDecision> = {},
): P218AssignmentDecision {
  return {
    candidateId: input.candidateId,
    action: "unable_to_assign",
    reason,
    currentAssignedDm: String(input.currentAssignedDm ?? "").trim() || "Unassigned",
    expectedAssignedDm: null,
    positionId: input.positionId?.trim() || null,
    positionName: input.position?.name ?? null,
    positionStatus: input.position?.status ?? null,
    positionLocation: null,
    market: null,
    territory: null,
    ...partial,
  };
}

/**
 * Pure P218 decision. Applied Position.Location is the only geography source;
 * title parsing and candidate-home fallback are intentionally absent.
 */
export function evaluateP218Assignment(
  input: P218AssignmentInput,
): P218AssignmentDecision {
  const current = String(input.currentAssignedDm ?? "").trim() || "Unassigned";
  const uniqueDms = [
    ...new Set(input.dmCandidates.map((dm) => dm.trim()).filter(Boolean)),
  ];
  const existingPosition = input.position;
  const existingGeography =
    existingPosition &&
    isAuthoritativeBreezyLocationSource(existingPosition.locationSource)
      ? resolveAuthoritativePostingGeography({
          positionId: input.positionId,
          positionName: existingPosition.name,
          positionStatus: existingPosition.status,
          city: existingPosition.city,
          state: existingPosition.state,
          zip: existingPosition.zip,
          displayLocation: existingPosition.displayLocation,
          locationSource: existingPosition.locationSource,
        })
      : null;

  if (!isP218Unassigned(current)) {
    return {
      candidateId: input.candidateId,
      action: "already_assigned",
      reason: input.manuallyAssigned
        ? "manual_assignment_protected"
        : "already_assigned",
      currentAssignedDm: current,
      expectedAssignedDm:
        existingGeography?.authoritative && uniqueDms.length === 1
          ? uniqueDms[0]!
          : null,
      positionId: input.positionId?.trim() || null,
      positionName: existingPosition?.name ?? null,
      positionStatus: existingPosition?.status ?? null,
      positionLocation: existingGeography?.authoritative
        ? {
            city: existingGeography.city,
            state: existingGeography.state,
            source: existingGeography.locationSource,
          }
        : null,
      market: existingGeography?.authoritative
        ? existingGeography.state
        : null,
      territory: existingGeography?.authoritative
        ? existingGeography.state
        : null,
    };
  }
  if (input.manuallyAssigned) return unable(input, "manual_assignment_protected");
  if (!isP218WorkflowActive(input.workflowStage)) return unable(input, "inactive_candidate");
  if (isP218CandidateArchived(input.candidateStage)) return unable(input, "archived_candidate");

  const positionId = input.positionId?.trim() ?? "";
  if (!positionId) return unable(input, "position_id_missing");
  if (!input.positionLookupAttempted || !input.position) {
    return unable(input, "position_lookup_failed");
  }

  const position = input.position;
  const hasAnyLocation = Boolean(position.city.trim() || position.state.trim());
  if (!hasAnyLocation) {
    return unable(input, "position_location_missing", {
      positionName: position.name,
      positionStatus: position.status,
    });
  }
  if (!isAuthoritativeBreezyLocationSource(position.locationSource)) {
    return unable(input, "position_location_not_authoritative", {
      positionName: position.name,
      positionStatus: position.status,
    });
  }

  const geography = resolveAuthoritativePostingGeography({
    positionId,
    positionName: position.name,
    positionStatus: position.status,
    city: position.city,
    state: position.state,
    zip: position.zip,
    displayLocation: position.displayLocation,
    locationSource: position.locationSource,
  });
  if (!geography.authoritative || !geography.state) {
    return unable(input, "territory_unknown", {
      positionName: position.name,
      positionStatus: position.status,
    });
  }

  const base = {
    positionId,
    positionName: position.name,
    positionStatus: position.status,
    positionLocation: {
      city: geography.city,
      state: geography.state,
      source: geography.locationSource,
    },
    market: geography.state,
    territory: geography.state,
  };
  if (uniqueDms.length === 0) return unable(input, "dm_lookup_failed", base);
  if (uniqueDms.length > 1) return unable(input, "multiple_dms_possible", base);

  return {
    candidateId: input.candidateId,
    action: "would_assign",
    reason: "assignable",
    currentAssignedDm: current,
    expectedAssignedDm: uniqueDms[0]!,
    ...base,
  };
}

const ALL_REASONS: P218Reason[] = [
  "assignable",
  "already_assigned",
  "manual_assignment_protected",
  "inactive_candidate",
  "archived_candidate",
  "position_id_missing",
  "position_lookup_failed",
  "position_location_missing",
  "position_location_not_authoritative",
  "territory_unknown",
  "dm_lookup_failed",
  "multiple_dms_possible",
  "concurrent_assignment_detected",
];

export function summarizeP218Decisions(
  decisions: P218AssignmentDecision[],
): P218Summary {
  const reasonDistribution = Object.fromEntries(
    ALL_REASONS.map((reason) => [reason, 0]),
  ) as Record<P218Reason, number>;
  for (const decision of decisions) {
    reasonDistribution[decision.reason] += 1;
  }
  return {
    candidatesEvaluated: decisions.length,
    alreadyAssigned: decisions.filter((decision) => decision.action === "already_assigned")
      .length,
    wouldAssign: decisions.filter((decision) => decision.action === "would_assign").length,
    unableToAssign: decisions.filter(
      (decision) => decision.action === "unable_to_assign",
    ).length,
    assigned: decisions.filter((decision) => decision.action === "assigned").length,
    skippedRace: decisions.filter((decision) => decision.action === "skipped_race").length,
    reasonDistribution,
  };
}
