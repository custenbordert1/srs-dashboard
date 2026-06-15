import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { ProjectRiskRow } from "@/lib/territory-action-engine/types";

const PROJECT_RISK_LIMIT = 24;

function mapStaffingRisk(
  staffingRisk: "GREEN" | "YELLOW" | "RED",
  coverageScore: number,
): ProjectRiskRow["riskLevel"] {
  if (staffingRisk === "RED" || coverageScore < 35) return "critical";
  if (staffingRisk === "YELLOW" || coverageScore < 55) return "high";
  if (coverageScore < 72) return "moderate";
  return "healthy";
}

function riskReason(row: CoverageRiskSnapshot["opportunities"][number]): string {
  const parts: string[] = [];
  if (row.staffingRisk === "RED") parts.push("critical staffing risk");
  else if (row.staffingRisk === "YELLOW") parts.push("elevated staffing risk");
  if (row.coverageScore < 50) parts.push(`coverage score ${row.coverageScore}`);
  if (row.nearby.activeWithin50 === 0) parts.push("no active reps within 50mi");
  else if (row.nearby.activeWithin50 < 2) parts.push("limited nearby rep pool");
  if (row.pipelineScore < 40) parts.push("weak recruiting pipeline signal");
  if (row.priority.toLowerCase() === "high") parts.push("high client priority");
  return parts.length > 0 ? parts.join("; ") : row.recommendedAction;
}

export function buildProjectRiskRows(coverage: CoverageRiskSnapshot): ProjectRiskRow[] {
  return coverage.opportunities
    .map((row) => {
      const riskLevel = mapStaffingRisk(row.staffingRisk, row.coverageScore);
      return {
        opportunityId: row.opportunityId,
        projectName: row.projectName,
        client: row.client,
        location: `${row.city}, ${row.state}`,
        dmName: row.territoryOwner,
        riskLevel,
        riskReason: riskReason(row),
        openCalls: 1,
        coveragePercent: row.coverageScore,
        applicantVelocityLabel:
          row.pipelineScore >= 60 ? "Healthy" : row.pipelineScore >= 35 ? "Flat" : "Declining",
        repAvailabilityScore: Math.min(100, Math.round(row.activeRepDensity * 100)),
      };
    })
    .filter((row) => row.riskLevel !== "healthy")
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, moderate: 2, healthy: 3 };
      return rank[a.riskLevel] - rank[b.riskLevel] || a.coveragePercent - b.coveragePercent;
    })
    .slice(0, PROJECT_RISK_LIMIT);
}
