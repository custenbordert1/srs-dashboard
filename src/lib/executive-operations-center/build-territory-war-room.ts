import type { TerritoryIntelligenceTerritoryRow } from "@/lib/territory-intelligence";
import type { RepCapacityRow } from "@/lib/territory-action-engine/types";
import type {
  CompanyHealthTier,
  ExecutiveTerritoryWarRoomRow,
} from "@/lib/executive-operations-center/types";

function tierFromMetrics(
  coveragePercent: number,
  riskScore: number,
): CompanyHealthTier {
  if (coveragePercent < 40 || riskScore >= 75) return "critical";
  if (coveragePercent < 55 || riskScore >= 60) return "at-risk";
  if (coveragePercent < 75 || riskScore >= 45) return "stable";
  return "healthy";
}

export function buildTerritoryWarRoomRows(
  territories: TerritoryIntelligenceTerritoryRow[],
  repCapacities: RepCapacityRow[],
): ExecutiveTerritoryWarRoomRow[] {
  const repByDm = new Map(repCapacities.map((row) => [row.dmName, row]));

  return territories
    .map((row) => {
      const rep = repByDm.get(row.dmName);
      const riskScore = Math.round(
        row.metrics.coverageRiskScore * 0.5 +
          row.attentionScore * 0.3 +
          (100 - row.metrics.coveragePercent) * 0.2,
      );
      const priorityActions = row.recommendations.slice(0, 3).map((rec) => rec.message);
      if (priorityActions.length === 0 && row.metrics.zeroApplicantJobs > 0) {
        priorityActions.push(`Refresh ads for ${row.metrics.zeroApplicantJobs} zero-applicant jobs`);
      }

      return {
        dmName: row.dmName,
        states: row.states,
        coveragePercent: row.metrics.coveragePercent,
        openCalls: row.metrics.openCalls,
        repPool: rep?.activeReps ?? row.metrics.activeReps,
        riskScore,
        priorityActions,
        riskTier: tierFromMetrics(row.metrics.coveragePercent, riskScore),
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}
