/** P188.3 — Recruiter ownership recovery (read-only analysis). */

export const P188_3_SOURCE_PHASE = "P188.3" as const;
export const P188_3_SCHEMA_VERSION = 1 as const;

export type P1883OwnershipSourceId =
  | "breezy_candidate_owner"
  | "breezy_assignee"
  | "breezy_recruiter"
  | "candidate_ingestion"
  | "p158_assignment_engine"
  | "p169_orchestrator"
  | "p171_lifecycle_manager"
  | "p83_advancement"
  | "candidate_workflow_store"
  | "historical_assignment_audit"
  | "executive_assignment_tools"
  | "territory_assignment_logic"
  | "recruiting_apis"
  | "workflow_persistence_ingestion_backfill";

export type P1883SourceTrace = {
  sourceId: P1883OwnershipSourceId;
  exists: boolean;
  currentlyPopulated: boolean;
  productionUsage: string;
  lastWriter: string | null;
  lastUpdate: string | null;
  whyOwnershipMissing: string;
  writesAssignedRecruiter: boolean;
};

export type P1883RootCauseCategory =
  | "never_imported"
  | "imported_then_discarded"
  | "never_persisted"
  | "overwritten"
  | "schema_mismatch"
  | "disabled_feature"
  | "regression"
  | "missing_integration"
  | "missing_migration";

export type P1883RootCauseFinding = {
  category: P1883RootCauseCategory;
  primary: boolean;
  evidence: string[];
  detail: string;
};

export type P1883RecoveryBucket =
  | "automatically_recoverable"
  | "operator_confirmation_required"
  | "impossible_to_recover"
  | "conflicting"
  | "stale";

export type P1883RecoverySimulationRow = {
  candidateId: string;
  bucket: P1883RecoveryBucket;
  proposedRecruiter: string | null;
  evidenceSource: string | null;
  evidenceAt: string | null;
  detail: string;
  jobResolved: boolean;
};

export type P1883AuthoritativeOwnershipDesign = {
  owner: string;
  lifecycle: string[];
  updateRules: string[];
  conflictRules: string[];
  reassignmentRules: string[];
  auditRequirements: string[];
  rollback: string[];
};
