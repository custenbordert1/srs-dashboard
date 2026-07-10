export const P185_2_SOURCE_PHASE = "P185.2";
export const P185_2_OPERATOR = "P185.2 Selection Recovery";

export type P1852EvidenceAuthority = "authoritative" | "supporting" | "ambiguous" | "informational";

export type P1852EvidenceItem = {
  source: string;
  authority: P1852EvidenceAuthority;
  detail: string;
  timestamp: string | null;
  actor: string | null;
};

export type P1852SelectionConfidence = "high" | "medium" | "low" | "none";

export type P1852SelectionClass =
  | "verified_selected_new_packet"
  | "verified_selected_existing_packet"
  | "verified_selected_completed_packet"
  | "likely_selected_needs_review"
  | "applied_not_selected"
  | "conflicting_selection_state"
  | "withdrawn_after_selection"
  | "hired_without_paperwork"
  | "unresolved_job"
  | "missing_contact"
  | "blocked_other"
  | "template_blocked";

export type P1852SelectionResolution = {
  candidateId: string;
  currentStage: string;
  normalizedStage: string;
  authoritativeEvidence: P1852EvidenceItem[];
  supportingEvidence: P1852EvidenceItem[];
  conflictingEvidence: P1852EvidenceItem[];
  evidenceSource: string | null;
  evidenceTimestamp: string | null;
  actor: string | null;
  selectionConfidence: P1852SelectionConfidence;
  proposedPaperworkAction: string;
  canAutoNormalize: boolean;
  requiresHumanReview: boolean;
  blockingReasons: string[];
  classification: P1852SelectionClass;
  reviewBucket: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";
};

export type P1852TemplateReadiness = {
  candidateId: string;
  templateKey: string | null;
  templateType: string | null;
  resolutionMethod: string;
  requiredFieldsPresent: boolean;
  templateReady: boolean;
  blockingReason: string | null;
};

export type P1852NormalizationRecord = {
  candidateId: string;
  originalStage: string;
  normalizedStage: "Paperwork Needed";
  evidenceSummary: string[];
  normalizedAt: string;
  actor: typeof P185_2_OPERATOR;
  overlayOnly: boolean;
  resolvedPositionId: string | null;
  templateKey: string | null;
  idempotencyKey: string;
};

export type P1852Projection = {
  eligibleCount: number;
  maxSendsPerCycle: number;
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  cycleIntervalMinutes: number;
  cyclesRequired: number;
  hoursRequired: number;
  daysRequired: number;
  deferredToNextDay: number;
  projectedCompletionLabel: string;
  rateLimitNotes: string[];
};

export type P1852RecoveryReport = {
  phase: typeof P185_2_SOURCE_PHASE;
  generatedAt: string;
  evidenceSourcesInspected: Array<{
    source: string;
    authority: P1852EvidenceAuthority;
    role: string;
  }>;
  counts: {
    evaluated: number;
    withAuthoritativeEvidence: number;
    recoveredFromP181: number;
    recoveredFromP83Executed: number;
    recoveredFromP97: number;
    recoveredFromP158: number;
    normalizedToPaperworkNeeded: number;
    eligibleNewPackets: number;
    templateBlocked: number;
    unresolvedSelectedJobs: number;
    needsOperatorConfirmation: number;
    activePackets: number;
    completedPackets: number;
    queueDepth: number;
    duplicatesPrevented: number;
  };
  comparison: {
    beforeEligible: number;
    afterEligible: number;
    beforeQueueDepth: number;
    afterQueueDepth: number;
  };
  projection: P1852Projection;
  dryRun: {
    evaluated: number;
    eligible: number;
    rejected: number;
    rejectionReasons: Array<{ reason: string; count: number }>;
  };
  classifications: Record<string, number>;
  liveReady: false;
  liveBlockers: string[];
  controlledLimits: Record<string, number | string>;
  activationSteps: string[];
  warnings: string[];
};

export type P1852OperatorReviewRow = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  originalStage: string;
  normalizedStage: string;
  selectionEvidence: string[];
  evidenceSource: string | null;
  evidenceDate: string | null;
  jobTitle: string | null;
  jobLocation: string | null;
  resolvedJobId: string | null;
  existingEnvelopeState: string | null;
  templateReadiness: boolean;
  proposedAction: string;
  blockingReason: string | null;
  bucket: P1852SelectionResolution["reviewBucket"];
};

export type P1852StateFile = {
  schemaVersion: 1;
  updatedAt: string;
  normalizations: P1852NormalizationRecord[];
  lastRunAt: string | null;
  stats: P1852RecoveryReport["counts"];
};
