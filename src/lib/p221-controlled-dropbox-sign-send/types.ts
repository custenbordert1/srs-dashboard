export const P221_PHASE = "P221" as const;
export const P221_MAX_CANDIDATES = 2;
export const P221_APPROVED_BY = "Taylor Custenborder" as const;
export const P221_REQUIRED_STAGE = "Paperwork Needed" as const;
export const P221_POST_SEND_STAGE = "Paperwork Sent" as const;
export const P221_REQUIRED_PAPERWORK_STATUS = "not_sent" as const;
export const P221_SENT_PAPERWORK_STATUS = "sent" as const;

/**
 * The only candidates P221 may touch — validated in P219/P220.
 */
export type P221Target = {
  candidateId: string;
  redactedCandidateId: string;
  expectedCity: string;
  expectedState: string;
  expectedDm: string;
  expectedPositionId: string;
  expectedName: string;
  expectedEmail: string;
};

export const P221_TARGETS: readonly P221Target[] = [
  {
    candidateId: "0f25dd13d4ed",
    redactedCandidateId: "3d272f69061a",
    expectedCity: "Columbus",
    expectedState: "OH",
    expectedDm: "Mindie Rodriguez",
    expectedPositionId: "73048dbe5519",
    expectedName: "John Henry White",
    expectedEmail: "jkggwhite1971@gmail.com",
  },
  {
    candidateId: "bc2111302660",
    redactedCandidateId: "c0d00937ae31",
    expectedCity: "Kansas City",
    expectedState: "MO",
    expectedDm: "Amy Harp",
    expectedPositionId: "f2ca3cdaeee8",
    expectedName: "Kathy Meyer",
    expectedEmail: "mjmwell@aol.com",
  },
] as const;

export type P221Mode = "preview" | "live";

export type P221ModeAuthorization = {
  mode: P221Mode;
  approved: boolean;
  approvedBy: string | null;
  failures: string[];
};

export type P221CheckResult = {
  ok: boolean;
  failures: string[];
};

export type P221EligibilityEvidence = {
  nearestActiveWorkMiles: number | null;
  hasActiveOpportunities: boolean;
  coverageKnown: boolean;
  jobCity: string;
  jobState: string;
};

export type P221WorkflowSnapshot = Record<string, unknown> & {
  candidateId: string;
  workflowStatus: string;
  assignedDM: string;
  assignedRecruiter?: string;
  paperworkStatus?: string;
  signatureRequestId?: string | null;
  paperworkSentAt?: string | null;
  paperworkTemplateKey?: string | null;
  onboardingContactEmail?: string | null;
  notes?: string[];
  history?: Array<{ id?: string; type?: string; message?: string; createdAt?: string }>;
};

/**
 * Write surface permitted by recordCandidatePaperworkSent / executeOnboardingSend.
 * Stage may move Paperwork Needed → Paperwork Sent only.
 */
export const P221_ALLOWED_CHANGED_FIELDS = new Set([
  "workflowStatus",
  "signatureRequestId",
  "paperworkStatus",
  "paperworkSentAt",
  "paperworkTemplateKey",
  "paperworkViewedAt",
  "paperworkViewCount",
  "paperworkSignedAt",
  "paperworkError",
  "onboardingContactEmail",
  "history",
  "nextActionNeeded",
  "lastActionAt",
  "updatedAt",
]);

export type P221FieldDiff = {
  field: string;
  allowed: boolean;
};

export type P221PostWriteResult = {
  ok: boolean;
  failures: string[];
  changedFields: P221FieldDiff[];
  previousStage: string;
  newStage: string;
  previousPaperworkStatus: string;
  newPaperworkStatus: string;
};

export type P221GlobalDiff = {
  targetIdsChanged: string[];
  nonTargetIdsChanged: string[];
  recordsAdded: string[];
  recordsRemoved: string[];
};
