import type {
  PlacementExecutionRecommendation,
  PlacementFitScores,
  PlacementMatchLabel,
  PlacementRecommendation,
} from "@/lib/placement-command-center/types";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function distanceFitScore(distanceMiles: number | null): number {
  if (distanceMiles === null) return 55;
  if (distanceMiles <= 25) return 95;
  if (distanceMiles <= 50) return 80;
  if (distanceMiles <= 75) return 62;
  return 40;
}

function territoryFitScore(coverageUrgency: PlacementRecommendation["coverageUrgency"]): number {
  if (coverageUrgency === "Critical") return 92;
  if (coverageUrgency === "At Risk") return 78;
  if (coverageUrgency === "Watch") return 65;
  return 50;
}

function availabilityFitScore(readinessStatus: PlacementRecommendation["readinessStatus"]): number {
  if (readinessStatus === "ready-to-place") return 95;
  if (readinessStatus === "needs-action") return 55;
  return 20;
}

function readinessFitScore(
  readinessStatus: PlacementRecommendation["readinessStatus"],
  confidence: PlacementRecommendation["confidence"],
): number {
  const readinessBase =
    readinessStatus === "ready-to-place" ? 90 : readinessStatus === "needs-action" ? 50 : 15;
  const confidenceBoost = confidence === "high" ? 8 : confidence === "medium" ? 4 : 0;
  return clampScore(readinessBase + confidenceBoost);
}

function resolveMatchLabel(input: {
  placementScore: number;
  readinessStatus: PlacementRecommendation["readinessStatus"];
  distanceFit: number;
  territoryFit: number;
}): PlacementMatchLabel {
  if (input.readinessStatus === "blocked") return "Do Not Recommend";
  if (
    input.placementScore >= 78 &&
    input.readinessStatus === "ready-to-place" &&
    input.distanceFit >= 70 &&
    input.territoryFit >= 65
  ) {
    return "Strong Match";
  }
  if (input.placementScore >= 62) {
    return "Good Match";
  }
  if (input.placementScore >= 45 || input.readinessStatus === "needs-action") {
    return "Review Needed";
  }
  return "Do Not Recommend";
}

function buildFitScores(rec: PlacementRecommendation): PlacementFitScores {
  const projectFit = clampScore(rec.placementScore);
  const distanceFit = distanceFitScore(rec.distanceMiles);
  const territoryFit = territoryFitScore(rec.coverageUrgency);
  const availabilityFit = availabilityFitScore(rec.readinessStatus);
  const readinessFit = readinessFitScore(rec.readinessStatus, rec.confidence);
  const placementConfidence = clampScore(
    projectFit * 0.35 +
      territoryFit * 0.2 +
      distanceFit * 0.15 +
      availabilityFit * 0.15 +
      readinessFit * 0.15,
  );

  return {
    placementConfidence,
    territoryFit,
    projectFit,
    distanceFit,
    availabilityFit,
    readinessFit,
  };
}

export function buildPlacementExecutionRecommendations(
  recommendations: PlacementRecommendation[],
): PlacementExecutionRecommendation[] {
  return recommendations.map((rec) => {
    const fitScores = buildFitScores(rec);
    const matchLabel = resolveMatchLabel({
      placementScore: rec.placementScore,
      readinessStatus: rec.readinessStatus,
      distanceFit: fitScores.distanceFit,
      territoryFit: fitScores.territoryFit,
    });

    return {
      ...rec,
      recommendationId: `placement-${rec.candidateId}-${rec.recommendedProjectId}`,
      matchLabel,
      fitScores,
    };
  });
}
