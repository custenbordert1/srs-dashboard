export const P140_SOURCE_PHASE = "P140";
export const P140_MONITORING_MODE = "readOnly" as const;

export type ComponentHealthStatus = "Healthy" | "Warning" | "Critical";
export type OverallHealthResult = "PASS" | "WARNING" | "CRITICAL";

export type ComponentStatus = {
  id: string;
  label: string;
  phase: string;
  status: ComponentHealthStatus;
  detail: string;
  lastCheckedAt: string;
};

export type HealthAlert = {
  id: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
  componentId: string;
};

export type HealthMetricsSnapshot = {
  at: string;
  candidatesEvaluated: number;
  autoApproved: number;
  humanReview: number;
  blocked: number;
  queueDepth: number;
  averageApprovalScore: number;
  sendReadiness: number;
  retryCount: number;
  schedulerUptimeMs: number;
  apiLatencyMs: number;
  dropboxConnectivity: ComponentHealthStatus;
  staleCandidateData: boolean;
  failedHealthChecks: number;
};

export type ProductionHealthExecutivePanel = {
  overallHealthScore: number;
  overallResult: OverallHealthResult;
  componentStatusSummary: string;
  activeAlertCount: number;
  systemUptimeMs: number;
  lastSuccessfulCycleAt: string | null;
  queueDepth: number;
  queueTrend: "stable" | "growing" | "shrinking" | "unknown";
  retryCount: number;
  retryTrend: "stable" | "growing" | "shrinking" | "unknown";
  dropboxHealth: ComponentHealthStatus;
  candidateSyncFreshness: string;
};

export type ProductionHealthReport = {
  sourcePhase: typeof P140_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P140_MONITORING_MODE;
  overallHealthScore: number;
  overallResult: OverallHealthResult;
  componentStatuses: ComponentStatus[];
  activeAlerts: HealthAlert[];
  metrics: HealthMetricsSnapshot;
  historicalMetrics: HealthMetricsSnapshot[];
  recommendations: string[];
  executivePanel: ProductionHealthExecutivePanel;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
};
