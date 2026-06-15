import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { ExecutiveProjectWarRoomRow } from "@/lib/executive-operations-center/types";
import type { ProjectRiskLevel } from "@/lib/territory-action-engine/types";

const WAR_ROOM_LIMIT = 80;

function mapRisk(
  staffingRisk: "GREEN" | "YELLOW" | "RED",
  coverageScore: number,
): ProjectRiskLevel {
  if (staffingRisk === "RED" || coverageScore < 35) return "critical";
  if (staffingRisk === "YELLOW" || coverageScore < 55) return "high";
  if (coverageScore < 72) return "moderate";
  return "healthy";
}

function riskRank(level: ProjectRiskLevel): number {
  return { critical: 0, high: 1, moderate: 2, healthy: 3 }[level];
}

function applicantsForState(state: string, candidates: BreezyCandidate[]): number {
  const code = normalizeStateCode(state);
  return candidates.filter((c) => normalizeStateCode(c.state) === code).length;
}

export function buildProjectWarRoomRows(
  coverage: CoverageRiskSnapshot,
  candidates: BreezyCandidate[],
): ExecutiveProjectWarRoomRow[] {
  return coverage.opportunities
    .map((row) => ({
      opportunityId: row.opportunityId,
      projectName: row.projectName,
      client: row.client,
      state: row.state,
      dmName: row.territoryOwner,
      openCalls: 1,
      coveragePercent: row.coverageScore,
      applicantCount: applicantsForState(row.state, candidates),
      riskLevel: mapRisk(row.staffingRisk, row.coverageScore),
      owner: row.territoryOwner,
      recommendation: row.recommendedAction,
    }))
    .sort(
      (a, b) =>
        riskRank(a.riskLevel) - riskRank(b.riskLevel) ||
        a.coveragePercent - b.coveragePercent,
    )
    .slice(0, WAR_ROOM_LIMIT);
}
