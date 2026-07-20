export const P220_PHASE = "P220" as const;
export const P220_MAX_CANDIDATES = 2;
export const P220_APPROVED_BY = "Taylor Custenborder" as const;
export const P220_TARGET_STAGE = "Paperwork Needed" as const;

/**
 * The only candidates P220 may touch — the two successfully updated in P219.
 * IDs and expected DMs are frozen from P219.
 */
export type P220Target = {
  candidateId: string;
  redactedCandidateId: string;
  expectedCity: string;
  expectedState: string;
  expectedDm: string;
  expectedPositionId: string;
};

export const P220_TARGETS: readonly P220Target[] = [
  {
    candidateId: "0f25dd13d4ed",
    redactedCandidateId: "3d272f69061a",
    expectedCity: "Columbus",
    expectedState: "OH",
    expectedDm: "Mindie Rodriguez",
    expectedPositionId: "73048dbe5519",
  },
  {
    candidateId: "bc2111302660",
    redactedCandidateId: "c0d00937ae31",
    expectedCity: "Kansas City",
    expectedState: "MO",
    expectedDm: "Amy Harp",
    expectedPositionId: "f2ca3cdaeee8",
  },
] as const;

export type P220Mode = "preview" | "live";

export type P220ModeAuthorization = {
  mode: P220Mode;
  approved: boolean;
  approvedBy: string | null;
  failures: string[];
};

export type P220CheckResult = {
  ok: boolean;
  failures: string[];
};

export type P220EligibilityEvidence = {
  nearestActiveWorkMiles: number | null;
  hasActiveOpportunities: boolean;
  coverageKnown: boolean;
  jobCity: string;
  jobState: string;
};

export type P220WorkflowSnapshot = Record<string, unknown> & {
  candidateId: string;
  workflowStatus: string;
  assignedDM: string;
  assignedRecruiter?: string;
  paperworkStatus?: string;
  signatureRequestId?: string | null;
  notes?: string[];
  history?: Array<{ id?: string; type?: string; message?: string; createdAt?: string }>;
};

/**
 * Stage-only upsert surface. assignedDM / recruiter / notes / paperwork /
 * signature fields must never change under P220.
 */
export const P220_ALLOWED_CHANGED_FIELDS = new Set([
  "workflowStatus",
  "lastActionAt",
  "updatedAt",
  "history",
  "nextActionNeeded",
]);

export type P220FieldDiff = {
  field: string;
  allowed: boolean;
};

export type P220PostWriteResult = {
  ok: boolean;
  failures: string[];
  changedFields: P220FieldDiff[];
  previousStage: string;
  newStage: string;
};

export type P220GlobalDiff = {
  targetIdsChanged: string[];
  nonTargetIdsChanged: string[];
  recordsAdded: string[];
  recordsRemoved: string[];
};

export type P220TransitionReason =
  | "transitioned"
  | "already_at_target_affirmed"
  | "abort_not_approved_id"
  | "abort_dm_mismatch"
  | "abort_not_eligible"
  | "abort_workflow_missing"
  | "abort_send_path"
  | "abort_beyond_paperwork_needed"
  | "abort_write_budget";
