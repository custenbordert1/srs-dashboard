import type { TerritoryAiAdvisorEntry } from "@/lib/ai-recruiting-command-center/types";
import type { TerritoryRecoveryPlan } from "@/lib/ai-action-engine/types";

export function buildTerritoryRecoveryPlans(
  advisor: TerritoryAiAdvisorEntry[],
): TerritoryRecoveryPlan[] {
  return advisor
    .filter((row) => row.attentionScore >= 40)
    .map((row) => ({
      territory: String(row.dmName),
      attentionScore: row.attentionScore,
      immediate: [
        row.recommendedActions[0] ?? "Review open calls with lowest coverage",
        "Confirm active rep assignments for this week",
      ],
      sevenDay: [
        "Increase sourcing in zero-applicant markets",
        "Run coverage optimization for top 5 open calls",
        row.predictedIssues[0] ?? "Monitor applicant velocity daily",
      ],
      thirtyDay: [
        "Rebalance rep territory assignments if coverage stays below 70%",
        "Audit job posting performance and refresh underperforming ads",
        "Review hire conversion and recruiter workload balance",
      ],
    }))
    .sort((a, b) => b.attentionScore - a.attentionScore)
    .slice(0, 8);
}
