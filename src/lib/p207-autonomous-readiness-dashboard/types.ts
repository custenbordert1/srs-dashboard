/** P207 / P207.1 — Autonomous Readiness Dashboard (read-only). */

export const P207_SOURCE_PHASE = "P207" as const;
export const P207_1_SOURCE_PHASE = "P207.1" as const;
export const P207_SCHEMA_VERSION = 2 as const;
export const P207_EXECUTION_MODE = "read_only" as const;

export const P207_STAGES = [
  "Applied",
  "Needs Review",
  "Paperwork Needed",
  "Paperwork Sent",
  "Signed",
  "Ready for MEL",
  "Rejected",
  "Historical",
] as const;

export type P207Stage = (typeof P207_STAGES)[number];

export type P207HealthTone = "healthy" | "warning" | "critical";

export type P207FreshnessState = "Live" | "Delayed" | "Stale";

export const P207_FRESHNESS_LIVE_MS = 5 * 60 * 1000;
export const P207_FRESHNESS_DELAYED_MS = 15 * 60 * 1000;

export type P207DropboxRecoveryState =
  | "Vendor Blocked"
  | "Quota Restored — Pilot Required"
  | "Pilot In Progress"
  | "Production Send Healthy"
  | "Configuration Unknown";

export type P207AlertSeverity = "critical" | "warning" | "informational";

export type P207Alert = {
  id: string;
  fingerprint: string;
  severity: P207AlertSeverity;
  title: string;
  explanation: string;
  affectedCount: number;
  subsystem: string;
  firstObservedAt: string;
  lastObservedAt: string;
  recommendedAction: string;
  supportingMetric: string;
  resolved: boolean;
  resolvedAt: string | null;
  drillKey: string | null;
};

export type P207StageMetrics = {
  stage: P207Stage;
  count: number;
  trend: number;
  lastUpdate: string | null;
  changeToday: number;
  largestBlocker: string | null;
  secondBlocker: string | null;
  estimatedHoursToClear: number | null;
  blockers: Array<{ id: string; label: string; count: number }>;
};

export type P207SubsystemScore = {
  id: string;
  label: string;
  score: number;
  tone: P207HealthTone;
  detail: string;
};

export type P207DropboxDiagnostics = {
  productionQuota: number | null;
  testMode: boolean | null;
  apiStatus: "ok" | "error" | "unknown";
  lastSuccessfulSendAt: string | null;
  lastFailedSendAt: string | null;
  templatesAvailable: number | null;
  accountEmail: string | null;
  accountIdHash: string | null;
  configurationStatus: "software_ready" | "vendor_blocked" | "misconfigured" | "unknown";
  softwareReady: boolean;
  vendorBlocked: boolean;
  detail: string;
  recoveryState: P207DropboxRecoveryState;
  previousQuota: number | null;
  quotaRestoredRecommendP206: boolean;
};

export type P207FunnelStep = {
  id: string;
  label: string;
  count: number;
  percentOfApplied: number;
  percentOfPrevious: number | null;
};

export type P207DrillRow = {
  candidateId: string;
  displayName: string;
  stage: P207Stage;
  blocker: string;
  reasonCodes: string[];
  confidence: number | null;
  assignedRecruiter: string;
  aiRecommendation: string | null;
  nextAction: string;
  nearestWork: string | null;
  lastActivityAt: string | null;
  owner: string;
};

export type P207ExecutiveCard = {
  id: string;
  title: string;
  count: number;
  tone: P207HealthTone;
  detail: string;
  drillKey?: string | null;
};

export type P207Forecast = {
  ifDropboxRestoredNow: {
    expectedSends: number;
    expectedSignatures: number;
    expectedReadyForMel: number;
  };
  next24h: {
    expectedSends: number;
    expectedSignatures: number;
    expectedReadyForMel: number;
  };
  next7d: {
    expectedSends: number;
    expectedSignatures: number;
    expectedReadyForMel: number;
  };
  assumptions: string[];
};

export type P207Validation = {
  authoritativeTotal: number;
  dashboardTotal: number;
  countMismatches: Array<{ stage: string; authoritative: number; dashboard: number }>;
  refreshLatencyMs: number;
  missingData: string[];
  matched: boolean;
};

export type P207Freshness = {
  generatedAt: string;
  observedAt: string;
  ageMs: number;
  state: P207FreshnessState;
};

export type P207Safety = {
  lifecycleWrites: false;
  paperworkNeededCreates: false;
  dropboxSends: false;
  p192Starts: false;
  automationEnabled: false;
  melWrites: false;
  p206AutoRerun: false;
};

export type P207PerformanceHint = {
  snapshotBuildMs: number;
  alertGenerationMs: number;
};

export type P207ReadinessSnapshot = {
  sourcePhase: typeof P207_SOURCE_PHASE;
  schemaVersion: typeof P207_SCHEMA_VERSION;
  executionMode: typeof P207_EXECUTION_MODE;
  generatedAt: string;
  freshness: P207Freshness;
  stages: P207StageMetrics[];
  subsystemScores: P207SubsystemScore[];
  overallScore: number;
  overallTone: P207HealthTone;
  dropbox: P207DropboxDiagnostics;
  funnel: P207FunnelStep[];
  executiveCards: P207ExecutiveCard[];
  forecast: P207Forecast;
  drillDown: P207DrillRow[];
  alerts: P207Alert[];
  activeAlertCount: number;
  validation: P207Validation;
  largestBlocker: string;
  immediateSendReady: number;
  autonomousReadiness: string;
  performance: P207PerformanceHint;
  safety: P207Safety;
};
