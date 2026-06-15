import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type {
  ProjectForecastOutcome,
  ProjectForecastRow,
} from "@/lib/executive-operations-center/types";

const FORECAST_LIMIT = 40;

function forecastOutcome(input: {
  coverageScore: number;
  pipelineScore: number;
  staffingRisk: "GREEN" | "YELLOW" | "RED";
  priority: string;
}): { outcome: ProjectForecastOutcome; confidence: number; reason: string } {
  let riskPoints = 0;
  const reasons: string[] = [];

  if (input.coverageScore < 40) {
    riskPoints += 3;
    reasons.push("low coverage");
  } else if (input.coverageScore < 60) {
    riskPoints += 1;
  }

  if (input.pipelineScore < 35) {
    riskPoints += 2;
    reasons.push("weak applicant pipeline");
  } else if (input.pipelineScore < 55) {
    riskPoints += 1;
  }

  if (input.staffingRisk === "RED") {
    riskPoints += 3;
    reasons.push("critical staffing gap");
  } else if (input.staffingRisk === "YELLOW") {
    riskPoints += 1;
  }

  if (input.priority.toLowerCase() === "high") {
    riskPoints += 1;
    reasons.push("high-priority deadline pressure");
  }

  if (riskPoints >= 5) {
    return {
      outcome: "likely-to-miss",
      confidence: Math.min(92, 55 + riskPoints * 6),
      reason: reasons.join("; ") || "Multiple miss signals",
    };
  }
  if (riskPoints >= 3) {
    return {
      outcome: "at-risk",
      confidence: Math.min(85, 50 + riskPoints * 7),
      reason: reasons.join("; ") || "Monitor staffing closely",
    };
  }
  return {
    outcome: "likely-to-finish",
    confidence: Math.min(90, 70 + (100 - riskPoints * 10)),
    reason: reasons.length > 0 ? reasons.join("; ") : "Coverage and pipeline on track",
  };
}

export function buildProjectForecastRows(
  coverage: CoverageRiskSnapshot,
): ProjectForecastRow[] {
  return coverage.opportunities
    .map((row) => {
      const forecast = forecastOutcome({
        coverageScore: row.coverageScore,
        pipelineScore: row.pipelineScore,
        staffingRisk: row.staffingRisk,
        priority: row.priority,
      });
      return {
        opportunityId: row.opportunityId,
        projectName: row.projectName,
        client: row.client,
        outcome: forecast.outcome,
        confidenceScore: forecast.confidence,
        reason: forecast.reason,
      };
    })
    .sort((a, b) => {
      const rank = { "likely-to-miss": 0, "at-risk": 1, "likely-to-finish": 2 };
      return rank[a.outcome] - rank[b.outcome] || b.confidenceScore - a.confidenceScore;
    })
    .slice(0, FORECAST_LIMIT);
}
