/** P204 — AI-assisted Candidate Qualification Engine (decision simulation only). */

export const P204_SOURCE_PHASE = "P204" as const;
export const P204_SCHEMA_VERSION = 1 as const;

export type P204Recommendation =
  | "advance_paperwork_needed"
  | "needs_recruiter_review"
  | "reject";

export type P204ReasonCode =
  | "high_qualification_confidence"
  | "calibrated_qualified"
  | "p193_qualified"
  | "strong_questionnaire"
  | "strong_resume"
  | "nearby_work_available"
  | "territory_fit"
  | "available_and_transport_ready"
  | "borderline_confidence"
  | "missing_questionnaire"
  | "missing_resume"
  | "weak_location_signal"
  | "duplicate_suspect"
  | "historical_applicant"
  | "low_confidence"
  | "fraud_spam_indicators"
  | "explicit_disqualify"
  | "invalid_contact"
  | "hard_gate_fail_closed_to_review"
  | "insufficient_enriched_signals"
  | "p193_not_qualified"
  | "calibrated_request_more_info";

export type P204QualificationDecision = {
  candidateId: string;
  redactedCandidateId: string;
  workflowStatus: string;
  recommendation: P204Recommendation;
  confidence: number;
  reasonCodes: P204ReasonCode[];
  evidence: string[];
  recommendedNextAction: string;
  components: {
    p193Decision: string;
    p193Confidence: number;
    p1934Decision: string;
    p1934Confidence: number;
    readinessScore: number;
    readinessConfidence: number;
    resumeScore: number;
    questionnaireScore: number;
    locationScore: number;
    experienceYears: number | null;
    nearestJobMiles: number | null;
    duplicateSuspect: boolean;
    fraudSpamScore: number;
  };
};

export type P204SimulationReport = {
  generatedAt: string;
  sourcePhase: typeof P204_SOURCE_PHASE;
  schemaVersion: typeof P204_SCHEMA_VERSION;
  appliedAnalyzed: number;
  recommendations: {
    advance: number;
    review: number;
    reject: number;
    advancePct: number;
    reviewPct: number;
    rejectPct: number;
  };
  averageConfidence: number;
  confidenceDistribution: Record<string, number>;
  topReasonCodes: Array<{ code: P204ReasonCode; count: number }>;
  falsePositiveReview: {
    count: number;
    pctOfReviews: number;
    definition: string;
  };
  estimatedRecruiterHoursSaved: number;
  assumptions: {
    minutesPerManualReview: number;
  };
  sideEffects: {
    lifecycleWrites: 0;
    paperworkWrites: 0;
    dropbox: 0;
    mel: 0;
    p192: 0;
    automationStarted: 0;
  };
  recommendation: "Ready for supervised pilot" | "Needs additional tuning";
};
