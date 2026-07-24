/** P188.2 — Breezy recruiter/job enrichment recovery (preview-only by default). */

export const P188_2_SOURCE_PHASE = "P188.2" as const;
export const P188_2_SCHEMA_VERSION = 1 as const;
export const P188_2_PILOT_MAX = 10 as const;
export const P188_2_AUTH_EXPIRATION_HOURS = 8 as const;

export type P1882Confidence = "high" | "medium" | "low" | "none";

export type P1882RecruiterSource =
  | "persisted"
  | "assignment_audit"
  | "breezy_assignee"
  | "internal_assignment"
  | "territory_dm"
  | "operator_confirmed";

export type P1882JobSource =
  | "breezy_position_id"
  | "breezy_job_id"
  | "friendly_id"
  | "ingestion_alias"
  | "approved_mapping"
  | "unique_title_city_state"
  | "operator_confirmed";

export type P1882RecruiterEnrichment = {
  candidateId: string;
  resolved: boolean;
  recruiter: string | null;
  source: P1882RecruiterSource | null;
  confidence: P1882Confidence;
  evidenceReference: string | null;
  ambiguous: boolean;
  conflicting: boolean;
  staleEvidence: boolean;
  alternateCandidates: string[];
  operatorActionRequired: string | null;
  detail: string;
};

export type P1882JobEnrichment = {
  candidateId: string;
  resolved: boolean;
  jobId: string | null;
  jobTitle: string | null;
  city: string | null;
  state: string | null;
  source: P1882JobSource | null;
  confidence: P1882Confidence;
  evidenceReference: string | null;
  ambiguous: boolean;
  conflicting: boolean;
  staleEvidence: boolean;
  alternateMatches: string[];
  operatorActionRequired: string | null;
  detail: string;
};

export type P1882EnrichmentPreviewUpdate = {
  candidateId: string;
  recruiter: string | null;
  recruiterSource: P1882RecruiterSource | null;
  jobId: string | null;
  jobSource: P1882JobSource | null;
  mappingVersion: string;
  auditCorrelationId: string;
  updatedTimestamp: string;
  bypassExcluded: boolean;
};

export type P1882OperatorQueueId =
  | "recruiter_confidently_resolved"
  | "recruiter_ambiguous"
  | "recruiter_unresolved"
  | "job_confidently_resolved"
  | "job_ambiguous"
  | "job_unresolved"
  | "both_resolved"
  | "one_resolved"
  | "conflicting_evidence"
  | "stale_evidence";

export type P1882OperatorQueueItem = {
  queueId: P1882OperatorQueueId;
  candidateId: string;
  redactedCandidateId: string;
  currentWorkflowState: string | null;
  proposedMatches: string[];
  evidence: string | null;
  confidence: P1882Confidence;
  recommendedOperatorSelection: string;
};

export type P1882PilotCandidate = {
  candidateId: string;
  redactedCandidateId: string;
  workflowStatus: string;
  recruiter: string;
  jobId: string;
  jobTitle: string | null;
  bypassExcluded: false;
};

export type P1882WriteAuthorizationPackage = {
  generatedAt: string;
  expiresAt: string;
  candidateIds: string[];
  mappings: P1882EnrichmentPreviewUpdate[];
  operatorConfirmationRequired: true;
  executed: false;
  productionWrites: 0;
  rollbackGuidance: string;
};
