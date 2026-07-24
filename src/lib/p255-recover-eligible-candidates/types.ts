import type { P253CandidateRow, P253ResultCode } from "@/lib/p253-controlled-live-paperwork-send/types";

export const P255_PHASE = "P255-recover-eligible-candidates";
export const P255_OPS_DATE = "2026-07-23";
export const P255_SOURCE_ARTIFACT = "artifacts/p254-eligibility-forensics.json";
export const P255_TAYLOR = "Taylor";
export const P255_BY_USER = "Taylor Custenborder";

export type P255FieldName =
  | "phone"
  | "city"
  | "state"
  | "zipCode"
  | "firstName"
  | "lastName"
  | "email"
  | "positionId"
  | "positionName"
  | "assignedRecruiter"
  | "assignedDM";

export type P255FieldSource =
  | "breezy"
  | "workflow_db"
  | "ingestion"
  | "p226_recovery_store"
  | "p193_questionnaire_backfill"
  | "p185_operator_review"
  | "p216_position_location_territory_routing"
  | "geocode_cache"
  | "none";

export type P255FieldAudit = {
  field: P255FieldName;
  before: string;
  after: string;
  source: P255FieldSource;
  applied: boolean;
  reason: string;
};

export type P255CandidateRecovery = {
  candidateId: string;
  name: string;
  email: string;
  blockersBefore: string[];
  blockersAfter: string[];
  repaired: boolean;
  nowEligible: boolean;
  stillBlocked: boolean;
  stillBlockedReasons: string[];
  eligibilityResultBefore: string;
  eligibilityResultAfter: P253ResultCode | string;
  nearestMilesAfter: number | null;
  coverageKnownAfter: boolean;
  fieldAudits: P255FieldAudit[];
  notes: string[];
};

export type P255Safety = {
  paperworkSends: 0;
  dropboxWrites: 0;
  breezyWrites: 0;
  melWrites: 0;
  workflowWrites: number;
  ingestionWrites: number;
};

export type P255MissionResult = {
  phase: typeof P255_PHASE;
  opsDate: typeof P255_OPS_DATE;
  generatedAt: string;
  mode: "recovery_apply" | "dry_run";
  sourceArtifact: string;
  persist: boolean;
  totals: {
    targeted: number;
    repaired: number;
    nowEligible: number;
    stillBlocked: number;
    fieldChangesApplied: number;
  };
  candidates: P255CandidateRecovery[];
  eligibilityRowsAfter: P253CandidateRow[];
  safety: P255Safety;
  notes: string[];
  artifacts: string[];
};
