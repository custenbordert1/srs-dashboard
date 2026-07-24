/** P228 — Production Readiness Assessment & Scale Authorization (read-only). */

export const P228_PHASE = "P228" as const;
export const P228_EXECUTION_MODE = "read_only" as const;
export const P228_SCHEMA_VERSION = 1 as const;

export const P228_BATCH_OPTIONS = [5, 10, 20, 50, 100, "unlimited"] as const;
export type P228BatchSize = (typeof P228_BATCH_OPTIONS)[number];

export type P228GoDecision = "GO" | "GO WITH CONDITIONS" | "NO GO";

export type P228RiskLevel = "Low" | "Medium" | "High";

export type P228EligibilityBlocker =
  | "missing_identity"
  | "missing_email"
  | "missing_phone"
  | "missing_position"
  | "missing_location"
  | "missing_assigned_dm"
  | "missing_recruiter"
  | "over_60_miles"
  | "coverage_unknown"
  | "archived"
  | "duplicate"
  | "already_sent"
  | "already_signed"
  | "other";

export type P228CoverageTier =
  | "tier1_0_20"
  | "tier2_21_39"
  | "review_40_60"
  | "out_of_range"
  | "unknown";

/** Enriched snapshot used by all pure assessors — no I/O. */
export type P228CandidateSnapshot = {
  candidateId: string;
  redactedCandidateId: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  zip: string;
  positionId: string;
  positionName: string;
  workflowStatus: string;
  paperworkStatus: string;
  signatureRequestId: string | null;
  assignedDM: string;
  assignedRecruiter: string;
  listMembershipSource: "ingestion" | "workflow_restored" | "workflow_only" | "unknown";
  nearestActiveWorkMiles: number | null;
  coverageKnown: boolean;
  coverageTier: P228CoverageTier;
  isDuplicate: boolean;
  recoveredIdentity: boolean;
  recoveredEmail: boolean;
  recoveredDm: boolean;
  /** True when candidate appears in P226 recovery store. */
  inRecoveryStore: boolean;
};

export type P228PipelineInventory = {
  totalCandidates: number;
  active: number;
  workflowActive: number;
  paperworkNeeded: number;
  paperworkSent: number;
  signed: number;
  readyForMel: number;
  loadedInMel: number;
  terminal: number;
  byStage: Record<string, number>;
};

export type P228EligibilityTotals = Record<P228EligibilityBlocker, number> & {
  eligible: number;
  evaluated: number;
  workflowActiveEvaluated: number;
};

export type P228EligibilityRow = {
  redactedCandidateId: string;
  state: string;
  workflowStatus: string;
  paperworkStatus: string;
  assignedDM: string;
  assignedRecruiter: string;
  nearestActiveWorkMiles: number | null;
  coverageTier: P228CoverageTier;
  eligible: boolean;
  blockers: P228EligibilityBlocker[];
  listMembershipSource: P228CandidateSnapshot["listMembershipSource"];
};

export type P228RecruiterHealthRow = {
  recruiter: string;
  candidateCount: number;
  paperworkQueue: number;
  interviewQueue: number;
  overdueQueue: number;
  readyForMel: number;
  unassignedCandidates: number;
  avgDistance: number | null;
  avgEligibilityScore: number;
};

export type P228DmHealthRow = {
  districtManager: string;
  assigned: number;
  paperwork: number;
  eligible: number;
  blocked: number;
  avgDistance: number | null;
  tierDistribution: Record<P228CoverageTier, number>;
};

export type P228GeographicCoverage = {
  strongestStates: Array<{ state: string; eligible: number; total: number; score: number }>;
  weakestStates: Array<{ state: string; eligible: number; total: number; score: number }>;
  marketsOver60: Array<{ state: string; count: number }>;
  coverageUnknown: Array<{ state: string; count: number }>;
  zeroEligible: Array<{ state: string; total: number }>;
};

export type P228DropboxSignHealth = {
  pending: number;
  viewed: number;
  signed: number;
  expired: number;
  cancelled: number;
  failed: number;
  duplicatePreventionCount: number;
  withSignatureRequestId: number;
  recentControlledSends: {
    p219_p221: number;
    p227: number;
    testMode: boolean;
  };
};

export type P228DataQuality = {
  recoveredIdentities: number;
  recoveredEmails: number;
  recoveredDms: number;
  workflowRestored: number;
  ingestionOnly: number;
  duplicates: number;
  orphanWorkflow: number;
  orphanIngestion: number;
  score: number;
};

export type P228RiskDimension =
  | "pipeline_stability"
  | "data_quality"
  | "routing_quality"
  | "recruiter_ownership"
  | "workflow_integrity"
  | "dropbox_reliability"
  | "recovery_reliability"
  | "dashboard_accuracy";

export type P228RiskAssessment = {
  dimensions: Record<
    P228RiskDimension,
    { level: P228RiskLevel; score: number; explanation: string | null }
  >;
  operationalReadinessScore: number;
};

export type P228ScaleRecommendation = {
  recommendedMaximumBatchSize: P228BatchSize;
  rationale: string[];
  eligiblePopulation: number;
  historicalValidation: {
    p219_p221_success: true;
    p227_success: true;
    p227_targets: 3;
    p227_sideEffects: 0;
    testModeOnly: true;
  };
  remainingBlockersTop: Array<{ blocker: P228EligibilityBlocker | "eligible"; count: number }>;
  riskSummary: string;
};

export type P228GoNoGo = {
  decision: P228GoDecision;
  conditions: string[];
  blockers: string[];
};

export type P228HistoricalContext = {
  p219_p221ControlledSendsSucceeded: boolean;
  p223InboxRestored: boolean;
  p224InitialEligible: number;
  p226RecoveredEligible: number;
  p227LiveSendsSucceeded: number;
  p227SideEffects: number;
  p227TestMode: boolean;
  p227TargetRedactedIds: string[];
};

export type P228AssessmentInput = {
  generatedAt?: string;
  candidates: P228CandidateSnapshot[];
  /** All workflow keys (including non-active) for pipeline inventory. */
  allWorkflowStatuses: Record<string, string>;
  ingestionIds: string[];
  workflowIds: string[];
  historical: P228HistoricalContext;
};

export type P228Assessment = {
  phase: typeof P228_PHASE;
  schemaVersion: typeof P228_SCHEMA_VERSION;
  executionMode: typeof P228_EXECUTION_MODE;
  generatedAt: string;
  pipeline: P228PipelineInventory;
  eligibility: {
    totals: P228EligibilityTotals;
    rows: P228EligibilityRow[];
    topBlockers: Array<{ blocker: P228EligibilityBlocker | "eligible"; count: number }>;
  };
  recruiters: P228RecruiterHealthRow[];
  districtManagers: P228DmHealthRow[];
  geography: P228GeographicCoverage;
  dropbox: P228DropboxSignHealth;
  dataQuality: P228DataQuality;
  risk: P228RiskAssessment;
  scale: P228ScaleRecommendation;
  goNoGo: P228GoNoGo;
  safety: {
    candidateWrites: false;
    dropboxSends: false;
    melWrites: false;
    breezyWrites: false;
    workflowChanges: false;
    commits: false;
  };
};

export type P228OperationalDashboard = {
  phase: typeof P228_PHASE;
  generatedAt: string;
  operationalReadinessScore: number;
  dataQualityScore: number;
  goDecision: P228GoDecision;
  recommendedMaximumBatchSize: P228BatchSize;
  pipeline: P228PipelineInventory;
  eligibilityTotals: P228EligibilityTotals;
  topBlockers: Array<{ blocker: P228EligibilityBlocker | "eligible"; count: number }>;
  recruiterCount: number;
  dmCount: number;
  dropbox: P228DropboxSignHealth;
  geographyRisks: {
    over60Markets: number;
    coverageUnknownMarkets: number;
    zeroEligibleMarkets: number;
  };
  historical: P228HistoricalContext;
};
