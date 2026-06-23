import type { ApplicantPerformanceRow } from "@/lib/autonomous-recruiting-execution/types";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { ExecutiveTrackedAction } from "@/lib/executive-accountability/types";
import { P60_SOURCE_MODULE } from "@/lib/placement-command-center/index";
import type { PlacementOutcomeMetrics } from "@/lib/placement-command-center/types";

function placementCorrelations(correlations: ExecutionCorrelation[]): ExecutionCorrelation[] {
  return correlations.filter((row) => row.type === "placement");
}

function placementAccountabilityActions(actions: ExecutiveTrackedAction[]): ExecutiveTrackedAction[] {
  return actions.filter(
    (row) => row.sourceModule === P60_SOURCE_MODULE && row.recommendationKind === "placement",
  );
}

export function buildPlacementOutcomeMetrics(input: {
  correlations: ExecutionCorrelation[];
  accountabilityActions: ExecutiveTrackedAction[];
  applicantPerformance: ApplicantPerformanceRow[];
}): PlacementOutcomeMetrics {
  const placementRows = placementCorrelations(input.correlations);
  const accountabilityRows = placementAccountabilityActions(input.accountabilityActions);

  const recommendedPlacements = placementRows.filter((row) =>
    ["detected", "recommended", "approved", "executing", "completed"].includes(row.status),
  ).length;

  const approvedPlacements = placementRows.filter((row) =>
    ["approved", "executing", "completed"].includes(row.status),
  ).length;

  const completed = placementRows.filter((row) => row.status === "completed").length;
  const failed = placementRows.filter((row) => row.status === "failed").length;
  const terminal = completed + failed;
  const placementSuccessRate = terminal > 0 ? Math.round((completed / terminal) * 100) : null;

  const coverageGapsFilled = completed;

  const ttfValues = input.applicantPerformance
    .map((row) => row.timeToFillDays)
    .filter((value): value is number => value !== null);
  const timeToFillImprovementDays =
    ttfValues.length > 0
      ? Math.round(
          ttfValues.reduce((sum, value) => sum + Math.max(0, 21 - value), 0) / ttfValues.length,
        )
      : null;

  const successfulAccountability = accountabilityRows.filter((row) => row.status === "completed").length;
  const recommendationAccuracy =
    accountabilityRows.length > 0
      ? Math.round((successfulAccountability / accountabilityRows.length) * 100)
      : null;

  const placementRoi =
    completed > 0 ? Math.round(completed * 1.8 + coverageGapsFilled * 2.4) : null;

  return {
    recommendedPlacements,
    approvedPlacements,
    placementSuccessRate,
    coverageGapsFilled,
    placementRoi,
    timeToFillImprovementDays,
    recommendationAccuracy,
  };
}
