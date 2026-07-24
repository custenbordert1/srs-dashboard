/** P186.6 — Executive recruiting funnel, aging, and candidate health (read-only). */

export const P186_6_SOURCE_PHASE = "P186.6" as const;
export const P186_6_SCHEMA_VERSION = 6 as const;
export const P186_6_DEFAULT_MIN_SCORECARD_SAMPLE = 5;

export type P1866DateRangeKey =
  | "today"
  | "last_7_days"
  | "last_30_days"
  | "month_to_date"
  | "quarter_to_date"
  | "custom";

export type P1866FunnelStage =
  | "APPLIED"
  | "RECRUITER_REVIEW"
  | "HIRING_RECOMMENDATION"
  | "OPERATOR_APPROVED"
  | "PAPERWORK_NEEDED"
  | "PAPERWORK_SENT"
  | "PAPERWORK_VIEWED"
  | "PAPERWORK_SIGNED"
  | "ONBOARDING_COMPLETE"
  | "READY_FOR_MEL"
  | "MEL_EXPORT_REVIEW"
  | "EXPORTED";

export const P1866_FUNNEL_STAGES: readonly P1866FunnelStage[] = [
  "APPLIED",
  "RECRUITER_REVIEW",
  "HIRING_RECOMMENDATION",
  "OPERATOR_APPROVED",
  "PAPERWORK_NEEDED",
  "PAPERWORK_SENT",
  "PAPERWORK_VIEWED",
  "PAPERWORK_SIGNED",
  "ONBOARDING_COMPLETE",
  "READY_FOR_MEL",
  "MEL_EXPORT_REVIEW",
  "EXPORTED",
] as const;

export type P1866AgingBand = "healthy" | "warning" | "overdue" | "critical";
export type P1866HealthBand = "excellent" | "good" | "fair" | "poor" | "critical" | "unknown";

export type P1866ProductRole =
  | "executive"
  | "operator"
  | "recruiter"
  | "dm"
  | "read_only_viewer";

export type P1866CohortCandidate = {
  candidateId: string;
  /** Canonical dedupe key — reopen/rollback duplicates share this. */
  identityKey?: string;
  displayName?: string | null;
  funnelStage: P1866FunnelStage;
  stageEnteredAt: string;
  enteredInRange?: boolean;
  exitedInRange?: boolean;
  recruiter?: string | null;
  dm?: string | null;
  operator?: string | null;
  job?: string | null;
  client?: string | null;
  city?: string | null;
  state?: string | null;
  sourceSystem?: string | null;
  paperworkTemplate?: string | null;
  onboardingRequirement?: string | null;
  melExportBlocker?: string | null;
  blocked?: boolean;
  blockers?: string[];
  paperworkStatus?: string | null;
  missingDocuments?: boolean;
  onboardingBlocked?: boolean;
  jobUrgent?: boolean;
  jobAvailable?: boolean;
  workflowConflict?: boolean;
  shadowMismatch?: boolean;
  missingShadow?: boolean;
  assignmentClear?: boolean;
  unresolvedOperations?: boolean;
  sourceFreshnessMs?: number | null;
  recruiterActivityScore?: number | null;
  candidateResponsivenessScore?: number | null;
  approvalDelayMs?: number | null;
  viewedAt?: string | null;
  signedAt?: string | null;
  paperworkSentAt?: string | null;
  alreadyCountedIdentity?: boolean;
};

export type P1866FunnelStageMetrics = {
  stage: P1866FunnelStage;
  currentCount: number;
  enteredToday: number;
  exitedToday: number;
  conversionFromPrevious: number | null;
  cumulativeConversion: number | null;
  averageAgeMs: number | null;
  medianAgeMs: number | null;
  oldestAgeMs: number | null;
  blockedCount: number;
  healthDistribution: Record<P1866HealthBand, number>;
  trendVsPrevious: number | null;
};

export type P1866AgingResult = {
  candidateId: string;
  stage: P1866FunnelStage;
  ageMs: number;
  band: P1866AgingBand;
  breachDurationMs: number;
  owner: string | null;
  blocker: string | null;
  recommendedNextAction: string;
  sourceFreshnessMs: number | null;
};

export type P1866HealthScore = {
  candidateId: string;
  score: number;
  band: P1866HealthBand;
  positiveFactors: string[];
  negativeFactors: string[];
  blockers: string[];
  confidence: number;
  recommendedOperatorAction: string;
  staleDataDowngraded: boolean;
};

export type P1866Bottleneck = {
  dimension: string;
  key: string;
  candidateCount: number;
  averageAgeMs: number;
  overdueCount: number;
  throughput: number;
  conversion: number | null;
  trend: number | null;
  likelyRootCause: string;
  recommendedInvestigation: string;
  advisory: true;
};

export type P1866Scorecard = {
  ownerType: "recruiter" | "dm";
  owner: string;
  sampleSize: number;
  ranked: boolean;
  assignedCandidates: number;
  reviewsCompleted: number;
  recommendationsMade: number;
  approvalConversion: number | null;
  paperworkConversion: number | null;
  signedConversion: number | null;
  onboardingCompletion: number | null;
  readyForMelConversion: number | null;
  averageResponseTimeMs: number | null;
  averageTimeToRecommendationMs: number | null;
  averageAgingMs: number | null;
  staleCandidateCount: number;
  exceptionRate: number | null;
  insufficientSample: boolean;
};

export type P1866Exception = {
  id: string;
  kind: string;
  severity: "critical" | "high" | "medium" | "low";
  candidateId: string | null;
  detail: string;
  recommendedAction: string;
  status: "open" | "acknowledged";
  investigationOwner: string | null;
};

export type P1866Forecast = {
  metric: string;
  expectedValue: number;
  confidence: number;
  assumptions: string[];
  inputDateRange: string;
  sampleSize: number;
  insufficientData: boolean;
  warning: string | null;
};

export type P1866SystemHealth = {
  lastBreezyEventAt: string | null;
  lastWorkflowEventAt: string | null;
  lastDropboxEventAt: string | null;
  lastOnboardingEventAt: string | null;
  lastMelObservationAt: string | null;
  shadowIngestionLagMs: number | null;
  reconciliationAgeMs: number | null;
  missingSourceWarnings: string[];
  staleDataWarnings: string[];
  storageHealth: "ok" | "degraded" | "unknown";
  schemaHealth: "ok" | "degraded" | "unknown";
  generatedAt: string;
};
