export const P219_PHASE = "P219" as const;
export const P219_MAX_CANDIDATES = 2;
export const P219_APPROVED_BY = "Taylor Custenborder" as const;

/**
 * The only candidates P219 may touch — validated in P216/P218.
 * candidateId is the durable workflow-store key; redactedCandidateId is the
 * sha256(candidateId).slice(0, 12) hash used by P218 public artifacts.
 */
export type P219Target = {
  candidateId: string;
  redactedCandidateId: string;
  expectedCity: string;
  expectedState: string;
  expectedDm: string;
  expectedPositionId: string;
};

export const P219_TARGETS: readonly P219Target[] = [
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

/** Shape of a P218 operator-local ledger decision row (subset P219 needs). */
export type P219PreviewDecision = {
  candidateId: string;
  action: string;
  currentAssignedDm: string;
  expectedAssignedDm: string | null;
  positionId: string | null;
  positionLocation: { city: string; state: string; source: string } | null;
};

export type P219CheckResult = {
  ok: boolean;
  failures: string[];
};

/** Loose view of a workflow record for verification diffs. */
export type P219WorkflowSnapshot = Record<string, unknown> & {
  candidateId: string;
  workflowStatus: string;
  assignedDM: string;
  history?: Array<{ id?: string; type?: string; message?: string; createdAt?: string }>;
};

/**
 * Fields an assignedDM-only upsert is allowed to change, per
 * upsertCandidateWorkflowUnlocked: the DM itself, timestamps, one prepended
 * history "assignment" event, and the recomputed derived nextActionNeeded.
 */
export const P219_ALLOWED_CHANGED_FIELDS = new Set([
  "assignedDM",
  "lastActionAt",
  "updatedAt",
  "history",
  "nextActionNeeded",
]);

export type P219FieldDiff = {
  field: string;
  allowed: boolean;
};

export type P219PostWriteResult = {
  ok: boolean;
  failures: string[];
  changedFields: P219FieldDiff[];
};

export type P219GlobalDiff = {
  targetIdsChanged: string[];
  nonTargetIdsChanged: string[];
  recordsAdded: string[];
  recordsRemoved: string[];
};
