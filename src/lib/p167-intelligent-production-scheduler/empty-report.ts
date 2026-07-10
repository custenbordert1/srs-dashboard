import { P167_SOURCE_PHASE } from "@/lib/p167-intelligent-production-scheduler/types";
import type { P167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler/types";

const now = () => new Date().toISOString();

export function emptyP167SchedulerReport(): P167ProductionSchedulerReport {
  return {
    sourcePhase: P167_SOURCE_PHASE,
    generatedAt: now(),
    decision: {
      recommendation: "WAIT_10_MINUTES",
      confidence: 0,
      reason: "Degraded empty scheduler — context gather timed out.",
      limitingFactor: "Scheduler unavailable",
      nextRecommendedRunAt: null,
      estimatedCandidatesNextCycle: 0,
      projectedDropboxApiUsage: {
        postRequests: 0,
        getRequests: 0,
        totalRequests: 0,
        withinBudget: true,
        budgetCeiling: 35,
      },
      projectedQueueAfterCycle: 0,
    },
    context: {
      eligibleNow: 0,
      queueRemaining: 0,
      waitingOnSignature: 0,
      readyAfterRecruiterAssignment: 0,
      activeSignatureCount: 0,
      deferredReconciliationCount: 0,
      recruitersAvailable: 0,
      timeSinceLastCycleMs: null,
      lastCycleAt: null,
      lastSuccessfulCycleAt: null,
      dropboxRequestsPerMinute: 0,
      dropboxRateLimitRemaining: null,
      dropboxResponses429: 0,
      dropboxThrottlingDetected: false,
      recentSendFailures: 0,
      recentWorkflowFailures: 0,
      productionReadinessScore: null,
      processingLockHeld: false,
      daemonActive: false,
      continuousModeEnabled: false,
      runnerHealthy: false,
      duplicateProtectionActive: true,
      monitorBudget: 25,
      sendCapPerCycle: 10,
      todayPaperworkSent: 0,
      todayFailures: 0,
    },
    timeline: [],
    simulations: [],
    warnings: ["Degraded empty scheduler report"],
  };
}
