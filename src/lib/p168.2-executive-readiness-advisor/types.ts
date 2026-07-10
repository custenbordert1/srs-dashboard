export const P168_2_SOURCE_PHASE = "P168.2";

export type P1682Trend = "Improving" | "Stable" | "Declining";

export type P1682ReadinessSnapshot = {
  at: string;
  queueRemaining: number;
  readinessScore: number | null;
  deferredBacklog: number;
  dropboxWithinBudget: boolean;
  decisionScore: number;
  recommendation: string;
  confidence: number;
  reason: string;
  paperworkSentToday: number;
};

export type P1682CurrentReadiness = {
  executiveReadinessPercent: number;
  currentScore: number;
  requiredScore: number;
  remainingPoints: number;
  remainingGates: number;
  gateProgressLabel: string;
};

export type P1682ActionPlanItem = {
  id: string;
  label: string;
  complete: boolean;
  currentValue: string;
  targetValue: string;
  importance: "critical" | "high" | "medium";
  estimatedImpact: number;
};

export type P1682EstimatedReady = {
  estimatedReadyAt: string | null;
  confidence: number;
  remainingBlockers: string[];
  estimatedQueueAfterRun: number;
  projectedSends: number;
  projectedDropboxRequests: number;
};

export type P1682RecommendationProgress = {
  gatesComplete: number;
  gatesTotal: number;
  percentComplete: number;
  progressBar: string;
};

export type P1682ReadinessDelta = {
  hasPrevious: boolean;
  sinceLabel: string;
  queue: { before: number; after: number; delta: number; trend: P1682Trend };
  readiness: { before: number | null; after: number | null; delta: number | null; trend: P1682Trend };
  deferredBacklog: { before: number; after: number; delta: number; trend: P1682Trend };
  dropboxBudgetHealthy: { before: boolean; after: boolean };
  decisionScore: { before: number; after: number; delta: number; trend: P1682Trend };
  recommendation: { before: string; after: string; trend: P1682Trend; summary: string };
  paperworkSentDelta: number | null;
};

export type P1682TimelineEntry = {
  at: string;
  recommendation: string;
  confidence: number;
  decisionScore: number;
  reason: string;
  durationSincePriorMs: number | null;
  trend: P1682Trend;
};

export type P1682ExecutiveReadinessAdvisorReport = {
  sourcePhase: typeof P168_2_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  whyWaiting: string;
  whatMustChange: string[];
  currentReadiness: P1682CurrentReadiness;
  actionPlan: P1682ActionPlanItem[];
  estimatedReady: P1682EstimatedReady;
  recommendationProgress: P1682RecommendationProgress;
  delta: P1682ReadinessDelta;
  timeline: P1682TimelineEntry[];
  warnings: string[];
};
