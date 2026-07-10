export const P185_1_SOURCE_PHASE = "P185.1";
export const P185_1_OPERATOR = "Paperwork Eligibility Recovery";

export type P1851MappingMethod =
  | "exact_breezy_position_id"
  | "exact_external_job_id"
  | "ingestion_relationship"
  | "verified_legacy_id"
  | "unique_title_city_state"
  | "p109_approved_mapping"
  | "persisted_alias"
  | "unresolved";

export type P1851MappingConfidence = "high" | "medium" | "low" | "none";

export type P1851OnboardingJobClassification =
  | "published_accepting"
  | "open_unpublished"
  | "closed"
  | "archived"
  | "removed"
  | "historical_valid_for_onboarding"
  | "unknown";

export type P1851JobMappingResult = {
  candidateId: string;
  originalPositionId: string | null;
  resolvedPositionId: string | null;
  mappingMethod: P1851MappingMethod;
  confidence: P1851MappingConfidence;
  ambiguity: boolean;
  jobOpen: boolean;
  jobAcceptingCandidates: boolean;
  onboardingJobClassification: P1851OnboardingJobClassification;
  acceptingForOnboarding: boolean;
  supportingFields: Record<string, string | boolean | number | null>;
};

export type P1851NormalizedStage =
  | "applied"
  | "review"
  | "contacted"
  | "interview"
  | "selected"
  | "approved"
  | "hiring"
  | "paperwork_needed"
  | "paperwork_sent"
  | "awaiting_signature"
  | "signed"
  | "completed"
  | "ready_for_mel"
  | "hired"
  | "not_qualified"
  | "archived"
  | "withdrawn"
  | "unknown";

export type P1851PaperworkNeedClass =
  | "already_active_packet"
  | "paperwork_completed"
  | "eligible_new_packet"
  | "eligible_replacement_packet"
  | "awaiting_hiring_approval"
  | "applied_not_selected"
  | "unresolved_job"
  | "ambiguous_candidate_state"
  | "invalid_contact"
  | "withdrawn_or_archived"
  | "hired_no_action"
  | "blocked_other";

export type P1851HiringEvidence = {
  present: boolean;
  sources: string[];
  detail: string | null;
};

export type P1851EnvelopeLifecycle =
  | "sent_unverified"
  | "confirmed_sent"
  | "viewed"
  | "signed"
  | "declined"
  | "canceled"
  | "expired"
  | "failed"
  | "unknown";

export type P1851EnvelopeReconcileRow = {
  candidateId: string;
  envelopeId: string;
  previousPaperworkStatus: string | null;
  lifecycle: P1851EnvelopeLifecycle;
  replacementEligible: boolean;
  replacementReason: string | null;
  error: string | null;
};

export type P1851CandidateRecovery = {
  candidateId: string;
  classification: P1851PaperworkNeedClass;
  normalizedStage: P1851NormalizedStage;
  currentStage: string;
  mapping: P1851JobMappingResult;
  hiringEvidence: P1851HiringEvidence;
  envelopeLifecycle: P1851EnvelopeLifecycle | null;
  proposedAction: string;
  eligibilityNote: string;
  reviewBucket: "A" | "B" | "C" | "D" | "E" | "F";
};

export type P1851JobMappingAlias = {
  originalPositionId: string;
  resolvedPositionId: string;
  mappingMethod: P1851MappingMethod;
  confidence: P1851MappingConfidence;
  updatedAt: string;
  supportingFields?: Record<string, string | boolean | number | null>;
};

export type P1851RecoveryStateFile = {
  schemaVersion: 1;
  updatedAt: string;
  aliases: P1851JobMappingAlias[];
  lastRecoveryAt: string | null;
  lastDryRunAt: string | null;
  stats: {
    evaluated: number;
    eligibleNew: number;
    eligibleReplacement: number;
    awaitingApproval: number;
    appliedNotSelected: number;
    unresolvedJobs: number;
    activePackets: number;
    completedPackets: number;
  };
};

export type P1851OperatorReviewRow = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  currentStage: string;
  normalizedStage: P1851NormalizedStage;
  jobTitle: string | null;
  jobCityState: string | null;
  originalJobId: string | null;
  resolvedJobId: string | null;
  mappingMethod: P1851MappingMethod;
  hiringSelectionEvidence: string[];
  existingEnvelopeState: P1851EnvelopeLifecycle | null;
  proposedAction: string;
  eligibilityResult: string;
  rejectionOrReviewReason: string;
  bucket: "A" | "B" | "C" | "D" | "E" | "F";
};

export type P1851RecoveryReport = {
  phase: typeof P185_1_SOURCE_PHASE;
  generatedAt: string;
  rootCause: string[];
  mappingCoverage: {
    beforeUnmatched: number;
    afterUnresolved: number;
    beforeMatched: number;
    afterMatched: number;
    coveragePctAfter: number;
  };
  envelopeReconciliation: {
    attempted: number;
    byLifecycle: Record<string, number>;
    replacementReview: number;
    unresolved: number;
  };
  classifications: Record<P1851PaperworkNeedClass, number>;
  dryRun: {
    evaluated: number;
    eligible: number;
    rejected: number;
    queueDepth: number;
    estimatedClearanceMinutes: number;
    projectedSendsPerHour: number;
    projectedSendsPerDay: number;
    rejectionReasons: Array<{ reason: string; count: number }>;
  };
  comparison: {
    beforeEligible: number;
    afterEligible: number;
    beforeUnmatchedJobs: number;
    afterUnresolvedJobs: number;
  };
  gates: Record<string, boolean | string | number>;
  liveReady: boolean;
  liveBlockers: string[];
  controlledLimits: Record<string, number | string | boolean>;
  activationSteps: string[];
  warnings: string[];
};
