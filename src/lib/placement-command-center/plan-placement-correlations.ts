import { randomUUID } from "node:crypto";
import {
  upsertCorrelations,
  type ExecutionCorrelation,
} from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type {
  PlacementExecutionRecommendation,
  PlacementMatchLabel,
} from "@/lib/placement-command-center/types";

function priorityFromLabel(label: PlacementMatchLabel): ExecutionCorrelation["priority"] {
  if (label === "Strong Match") return "high";
  if (label === "Good Match") return "medium";
  return "low";
}

export async function planPlacementCorrelations(
  recommendations: PlacementExecutionRecommendation[],
): Promise<ExecutionCorrelation[]> {
  const now = new Date().toISOString();
  const incoming: ExecutionCorrelation[] = recommendations
    .filter((row) => row.matchLabel !== "Do Not Recommend")
    .map((row) => ({
      id: randomUUID(),
      recommendationId: row.recommendationId,
      territory: row.recommendedTerritory,
      type: "placement",
      priority: priorityFromLabel(row.matchLabel),
      status: "detected",
      createdAt: now,
      candidateId: row.candidateId,
      displayTitle: `Place ${row.candidateName} on ${row.recommendedProject}`,
      placementProjectId: row.recommendedProjectId,
      placementMatchLabel: row.matchLabel,
      hiringAction: "Hire Now",
      reason: [
        ...row.reasons,
        `Match: ${row.matchLabel}`,
        `Confidence ${row.fitScores.placementConfidence}%`,
      ].join(" · "),
    }));

  return upsertCorrelations(incoming);
}
