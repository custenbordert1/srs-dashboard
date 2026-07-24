export const P193_2_SOURCE_PHASE = "P193.2" as const;
export const P193_2_SCHEMA_VERSION = 1 as const;
export const P193_2_MAX_COHORT = 10;
export const P193_2_MIN_COHORT = 3;
export const P193_2_AUTH_EXPIRATION_HOURS = 24;
export const P193_2_REASON = "P193.2 controlled simplified lifecycle production pilot";

export type P1932PreflightResult = {
  ok: boolean;
  checkedAt: string;
  gates: Array<{ id: string; ok: boolean; detail: string }>;
  abortReasons: string[];
};

export type P1932CohortMember = {
  candidateId: string;
  positionId: string;
  positionName: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  hasResume: boolean;
  hasQuestionnaire: boolean;
  emailHash: string;
  phoneHash: string;
  legacyWorkflowStatus: string | null;
};

export type P1932FrozenCohort = {
  schemaVersion: typeof P193_2_SCHEMA_VERSION;
  pilotId: string;
  fingerprint: string;
  frozenAt: string;
  expiresAt: string;
  immutable: true;
  maxSize: number;
  members: P1932CohortMember[];
  selectionBlockers: Record<string, number>;
  candidatesEvaluated: number;
};

export type P1932AiReviewRow = {
  candidateId: string;
  decision: "Qualified" | "Needs Human Review" | "Not Qualified";
  confidence: number;
  resumeScore: number | null;
  questionnaireScore: number | null;
  experienceYears: number | null;
  nearbyJobCount: number;
  distanceToNearestWorkMiles: number | null;
  duplicateSuspect: boolean;
  fraudSpamScore: number | null;
  borderline: boolean;
  reasons: string[];
  missingData: string[];
  explanation: string;
};

export type P1932OperatorReviewItem = {
  candidateId: string;
  positionName: string;
  location: string;
  qualificationResult: P1932AiReviewRow["decision"];
  confidence: number;
  evidence: string[];
  blockers: string[];
  predictedPaperworkEligible: boolean;
  expectedNextStage: string;
  operatorConfirmed: boolean;
};

export type P1932BridgeAttempt = {
  candidateId: string;
  ok: boolean;
  bridged: boolean;
  simplifiedState: string | null;
  legacyWorkflowStatus: string | null;
  error: string | null;
  duplicatePrevented: boolean;
};

export type P1932PilotAuthority = {
  pilotId: string;
  fingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  maxCandidates: number;
  confirmedQualifiedIds: string[];
  flagsScoped: {
    enabled: boolean;
    aiAutoQualifyEnabled: boolean;
    paperworkBridgeEnabled: boolean;
    reminderSendEnabled: false;
    readyForAssignmentEnabled: boolean;
    dropboxObserverEnabled: boolean;
  };
};
