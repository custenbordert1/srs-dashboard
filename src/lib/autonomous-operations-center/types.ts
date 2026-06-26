export const P75_SOURCE_PHASE = "P75";
export const P75_PREVIEW_MODE = true as const;
export const P75_DEFAULT_OPERATIONS_CENTER_ENABLED = false;
export const P75_DEFAULT_EXECUTION_MODE = "preview" as const;

export type OperationsExecutionMode = "off" | "preview" | "pilot" | "production";

export type OperationsEngineId =
  | "recruiting"
  | "paperwork"
  | "execution"
  | "communication"
  | "onboarding"
  | "executive"
  | "orchestrator"
  | "operations";

export type OperationsSeverity = "low" | "medium" | "high" | "critical";

export type OperationsHealthStatus = "healthy" | "warning" | "critical" | "offline";

export type OperationalIssueType =
  | "candidate_stalled"
  | "paperwork_blocked"
  | "communication_overdue"
  | "missing_onboarding"
  | "duplicate_paperwork"
  | "missing_email"
  | "missing_recruiter"
  | "workflow_dead_end"
  | "queue_growing"
  | "engine_unavailable"
  | "data_quality"
  | "validation_failure"
  | "workflow_failure"
  | "performance_degradation";

export type P75FeatureFlags = {
  operationsCenterEnabled: boolean;
  executionMode: OperationsExecutionMode;
  previewMode: boolean;
  updatedAt: string;
};

export type OperationsControls = {
  operationsCenterEnabled: boolean;
  executionMode: OperationsExecutionMode;
  previewMode: boolean;
  canExecute: boolean;
  previewOnly: boolean;
};

export type OperationalIssue = {
  issueId: string;
  issueType: OperationalIssueType;
  severity: OperationsSeverity;
  reason: string;
  affectedCandidateIds: string[];
  affectedCandidateNames: string[];
  recommendedAction: string;
  responsibleEngine: OperationsEngineId;
  owner: string;
  confidence: number;
  detectedAt: string;
};

export type OperationalIncidentStatus = "open" | "resolved" | "simulated_resolved";

export type OperationalIncident = {
  incidentId: string;
  issueType: OperationalIssueType;
  severity: OperationsSeverity;
  status: OperationalIncidentStatus;
  engine: OperationsEngineId;
  title: string;
  impact: string;
  detectedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  durationMs: number | null;
  recommendedResolution: string;
  affectedCount: number;
  auditTrail: Array<{ at: string; event: string; detail: string | null }>;
};

export type PlatformHealthContributor = {
  id: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
};

export type PlatformHealthScore = {
  overall: number;
  contributors: PlatformHealthContributor[];
  summary: string;
  improvements: string[];
};

export type EngineMonitoringReport = {
  engineId: OperationsEngineId;
  label: string;
  status: OperationsHealthStatus;
  explanation: string;
  openIssues: number;
};

export type PredictiveRisk = {
  id: string;
  label: string;
  likelihood: "low" | "medium" | "high";
  impact: string;
  recommendation: string;
  engine: OperationsEngineId;
};

export type OperationsExecutiveMetrics = {
  openIncidents: number;
  criticalIncidents: number;
  resolvedToday: number;
  averageResolutionTimeMs: number | null;
  workflowSuccessRate: number | null;
  automationSuccessRate: number | null;
  platformHealth: number;
  systemUptimePercent: number | null;
  predictedIssues: number;
  recruiterWorkload: number;
  timeSaved: number;
};

export type OperationsDashboardSnapshot = {
  sourcePhase: typeof P75_SOURCE_PHASE;
  previewMode: typeof P75_PREVIEW_MODE;
  fetchedAt: string;
  controls: OperationsControls;
  systemHealth: { status: OperationsHealthStatus; summary: string };
  workflowHealth: { healthy: number; warning: number; critical: number; total: number };
  automationHealth: { automated: number; blocked: number; percent: number | null };
  dataHealth: { missingEmail: number; missingRecruiter: number; validationFailures: number };
  queueHealth: { depth: number; growing: boolean; bottleneck: string | null };
  performance: { buildMsEstimate: number | null; cacheHealthy: boolean };
  openRisks: OperationalIssue[];
  criticalAlerts: OperationalIssue[];
  recentIncidents: OperationalIncident[];
  resolvedIncidents: OperationalIncident[];
  executiveRecommendations: string[];
  engineMonitoring: EngineMonitoringReport[];
  platformHealth: PlatformHealthScore;
  predictiveRisks: PredictiveRisk[];
  executiveMetrics: OperationsExecutiveMetrics;
  warnings: string[];
};

export type AutonomousOperationsCenterPreviewResult = {
  ok: true;
  previewMode: typeof P75_PREVIEW_MODE;
  fetchedAt: string;
  dashboard: OperationsDashboardSnapshot;
  warnings: string[];
};
