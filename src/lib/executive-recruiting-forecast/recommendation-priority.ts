import type {
  ExecutiveForecastRecommendation,
  RecommendationPriority,
  TerritoryShortageForecastRow,
} from "@/lib/executive-recruiting-forecast/types";

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function classifyRecommendationPriority(input: {
  kind: ExecutiveForecastRecommendation["kind"];
  territory?: TerritoryShortageForecastRow;
  overdueFollowUps?: number;
  assignedCandidates?: number;
}): RecommendationPriority {
  if (input.kind === "escalate-dm-territory" && input.territory) {
    if (input.territory.shortageScore >= 85 || (input.territory.activeReps === 0 && input.territory.openOpportunities >= 3)) {
      return "critical";
    }
    if (input.territory.likelyMissCoverage) return "high";
    return "medium";
  }
  if (input.kind === "move-recruiter-focus") {
    if ((input.overdueFollowUps ?? 0) >= 5 || (input.assignedCandidates ?? 0) >= 35) return "critical";
    return "high";
  }
  if (input.kind === "refresh-job-ads") return "high";
  if (input.kind === "prioritize-candidates") return "medium";
  if (input.kind === "increase-pay") return "medium";
  return "low";
}

export function sortRecommendationsByPriority(
  recommendations: ExecutiveForecastRecommendation[],
): ExecutiveForecastRecommendation[] {
  return [...recommendations].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title),
  );
}

export function recommendationPriorityLabel(priority: RecommendationPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
