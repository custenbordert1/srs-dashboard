import { P168_2_SOURCE_PHASE } from "@/lib/p168.2-executive-readiness-advisor/types";
import type { P1682ExecutiveReadinessAdvisorReport } from "@/lib/p168.2-executive-readiness-advisor/types";

const now = () => new Date().toISOString();

export function emptyP1682ReadinessAdvisorReport(): P1682ExecutiveReadinessAdvisorReport {
  return {
    sourcePhase: P168_2_SOURCE_PHASE,
    generatedAt: now(),
    readOnly: true,
    whyWaiting: "Advisor unavailable — timed out.",
    whatMustChange: [],
    currentReadiness: {
      executiveReadinessPercent: 0,
      currentScore: 0,
      requiredScore: 80,
      remainingPoints: 80,
      remainingGates: 0,
      gateProgressLabel: "Unavailable",
    },
    actionPlan: [],
    estimatedReady: {
      estimatedReadyAt: null,
      confidence: 0,
      remainingBlockers: [],
      estimatedQueueAfterRun: 0,
      projectedSends: 0,
      projectedDropboxRequests: 0,
    },
    recommendationProgress: {
      gatesComplete: 0,
      gatesTotal: 0,
      percentComplete: 0,
      progressBar: "░░░░░░░░░░",
    },
    delta: {
      hasPrevious: false,
      sinceLabel: "—",
      queue: { before: 0, after: 0, delta: 0, trend: "Stable" },
      readiness: { before: null, after: null, delta: null, trend: "Stable" },
      deferredBacklog: { before: 0, after: 0, delta: 0, trend: "Stable" },
      dropboxBudgetHealthy: { before: true, after: true },
      decisionScore: { before: 0, after: 0, delta: 0, trend: "Stable" },
      recommendation: {
        before: "WAIT",
        after: "WAIT",
        trend: "Stable",
        summary: "—",
      },
      paperworkSentDelta: null,
    },
    timeline: [],
    warnings: ["Degraded empty readiness advisor report"],
  };
}
