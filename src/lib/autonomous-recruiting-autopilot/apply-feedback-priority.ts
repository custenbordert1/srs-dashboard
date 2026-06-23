import type { RecommendedAd } from "@/lib/autonomous-recruiting-engine/types";
import type { RecommendationFeedbackIndex } from "@/lib/autonomous-recruiting-autopilot/types";

function boostPriority(
  priority: RecommendedAd["priority"],
  score: number,
): RecommendedAd["priority"] {
  if (score >= 75 && priority === "medium") return "high";
  if (score >= 60 && priority === "low") return "medium";
  if (score <= 35 && priority === "high") return "medium";
  if (score <= 25 && priority === "medium") return "low";
  return priority;
}

export function applyRecommendationFeedbackToAds(
  ads: RecommendedAd[],
  feedback?: RecommendationFeedbackIndex,
): RecommendedAd[] {
  if (!feedback) return ads;

  return ads.map((ad) => {
    const territoryScore = feedback.territoryWeights[ad.territory] ?? 50;
    const typeScore = feedback.typeWeights[ad.adType] ?? 50;
    const blended = Math.round((territoryScore + typeScore) / 2);
    return {
      ...ad,
      priority: boostPriority(ad.priority, blended),
      reason:
        blended >= 60
          ? `${ad.reason} · P59 feedback: strong historical performance in territory`
          : blended <= 35
            ? `${ad.reason} · P59 feedback: lower historical yield — deprioritized`
            : ad.reason,
    };
  });
}
