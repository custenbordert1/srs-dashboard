import type { BreezyJobLocationSource } from "@/lib/breezy-job-location";

export const P218_PHASE = "P218" as const;

export type P218Mode = "preview" | "live";

export type P218AssignmentAction =
  | "would_assign"
  | "assigned"
  | "already_assigned"
  | "unable_to_assign"
  | "skipped_race";

export type P218Reason =
  | "assignable"
  | "already_assigned"
  | "manual_assignment_protected"
  | "inactive_candidate"
  | "archived_candidate"
  | "position_id_missing"
  | "position_lookup_failed"
  | "position_location_missing"
  | "position_location_not_authoritative"
  | "territory_unknown"
  | "dm_lookup_failed"
  | "multiple_dms_possible"
  | "concurrent_assignment_detected";

export type P218ResolvedPosition = {
  positionId: string;
  name: string;
  status: string;
  city: string;
  state: string;
  zip: string;
  displayLocation: string;
  locationSource: BreezyJobLocationSource | string;
};

export type P218AssignmentInput = {
  candidateId: string;
  workflowStage: string;
  candidateStage: string;
  currentAssignedDm: string | null | undefined;
  manuallyAssigned: boolean;
  positionId: string | null | undefined;
  positionLookupAttempted: boolean;
  position: P218ResolvedPosition | null;
  dmCandidates: string[];
};

export type P218AssignmentDecision = {
  candidateId: string;
  action: P218AssignmentAction;
  reason: P218Reason;
  currentAssignedDm: string;
  expectedAssignedDm: string | null;
  positionId: string | null;
  positionName: string | null;
  positionStatus: string | null;
  positionLocation: {
    city: string;
    state: string;
    source: string;
  } | null;
  market: string | null;
  territory: string | null;
};

export type P218ModeAuthorization = {
  mode: P218Mode;
  approved: boolean;
  approvedBy: string | null;
  failures: string[];
};

export type P218Summary = {
  candidatesEvaluated: number;
  alreadyAssigned: number;
  wouldAssign: number;
  unableToAssign: number;
  assigned: number;
  skippedRace: number;
  reasonDistribution: Record<P218Reason, number>;
};
