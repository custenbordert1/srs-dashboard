import type { P1681ExecutiveDecisionCenterView } from "@/lib/p168.1-executive-decision-center/types";
import type { P1682EstimatedReady } from "@/lib/p168.2-executive-readiness-advisor/types";

export function estimateNextReadyTime(
  view: P1681ExecutiveDecisionCenterView,
  remainingBlockers: string[],
): P1682EstimatedReady {
  const estimatedReadyAt =
    view.recommendation.nextRecommendedRunAt ?? view.blocking.nextExpectedApprovalAt;

  let confidence = view.recommendation.confidence;
  if (view.recommendation.action === "RUN_NEXT_BATCH") {
    confidence = Math.min(98, confidence + 5);
  } else if (view.recommendation.action === "HOLD_INVESTIGATION") {
    confidence = Math.max(40, confidence - 20);
  } else if (remainingBlockers.length > 3) {
    confidence = Math.max(50, confidence - 15);
  } else if (remainingBlockers.length > 0) {
    confidence = Math.max(60, confidence - 5);
  }

  return {
    estimatedReadyAt,
    confidence: Math.min(99, Math.round(confidence)),
    remainingBlockers,
    estimatedQueueAfterRun: view.recommendation.projectedQueueAfterCycle,
    projectedSends: view.recommendation.expectedSends,
    projectedDropboxRequests: view.recommendation.projectedDropboxRequests,
  };
}
