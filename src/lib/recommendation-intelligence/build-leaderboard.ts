import { AUTOPILOT_RECOMMENDATION_LABELS } from "@/lib/recruiting-autopilot/recommendation-labels";
import { computeRoiScore, computeSuccessRate, isSuccessfulEffectiveness } from "@/lib/recommendation-intelligence/scoring";
import { summarizeActualGain } from "@/lib/recommendation-intelligence/outcome-tracking";
import type {
  RecommendationLeaderboardSnapshot,
  RecommendationOwnerPerformance,
  RecommendationRecord,
  RecommendationRoiLeaderboardEntry,
  RecommendationTypePerformance,
} from "@/lib/recommendation-intelligence/types";

function typeLabel(type: string): string {
  return (
    AUTOPILOT_RECOMMENDATION_LABELS[type as keyof typeof AUTOPILOT_RECOMMENDATION_LABELS] ??
    type.replace(/-/g, " ")
  );
}

export function buildTypePerformance(records: RecommendationRecord[]): RecommendationTypePerformance[] {
  const byType = new Map<string, RecommendationRecord[]>();
  for (const row of records) {
    const list = byType.get(row.recommendationType) ?? [];
    list.push(row);
    byType.set(row.recommendationType, list);
  }

  return [...byType.entries()].map(([recommendationType, scoped]) => {
    const scored = scoped.filter((row) => row.effectiveness != null);
    const successes = scored.filter((row) => isSuccessfulEffectiveness(row.effectiveness)).length;
    const gains = scored.map((row) => summarizeActualGain(row));
    return {
      recommendationType: recommendationType as RecommendationTypePerformance["recommendationType"],
      label: typeLabel(recommendationType),
      successRate: scored.length > 0 ? Math.round((successes / scored.length) * 100) : 0,
      totalTracked: scoped.length,
      highlyEffectiveCount: scored.filter((row) => row.effectiveness === "Highly Effective").length,
      ineffectiveCount: scored.filter(
        (row) => row.effectiveness === "Ineffective" || row.effectiveness === "Negative Impact",
      ).length,
      averageApplicantGain:
        gains.length > 0 ? Math.round(gains.reduce((sum, value) => sum + value, 0) / gains.length) : 0,
    };
  });
}

function ownerPerformance(
  records: RecommendationRecord[],
  field: "dmName" | "recruiter" | "project",
  ownerKind: RecommendationOwnerPerformance["ownerKind"],
): RecommendationOwnerPerformance[] {
  const byOwner = new Map<string, RecommendationRecord[]>();
  for (const row of records) {
    const owner = row[field];
    if (!owner) continue;
    const list = byOwner.get(owner) ?? [];
    list.push(row);
    byOwner.set(owner, list);
  }

  return [...byOwner.entries()]
    .map(([owner, scoped]) => {
      const scored = scoped.filter((row) => row.effectiveness != null);
      const successes = scored.filter((row) => isSuccessfulEffectiveness(row.effectiveness)).length;
      return {
        owner,
        ownerKind,
        successRate: scored.length > 0 ? Math.round((successes / scored.length) * 100) : 0,
        trackedCount: scoped.length,
        completedCount: scoped.filter((row) => row.status === "Completed").length,
      };
    })
    .sort((a, b) => b.successRate - a.successRate || b.trackedCount - a.trackedCount);
}

export function buildRoiLeaderboard(records: RecommendationRecord[]): RecommendationRoiLeaderboardEntry[] {
  return records
    .filter((row) => row.effectiveness != null || row.status === "In Progress" || row.status === "Executed")
    .map((row) => {
      const actualApplicantGain = summarizeActualGain(row);
      return {
        recommendationId: row.recommendationId,
        recommendationType: row.recommendationType,
        label: typeLabel(row.recommendationType),
        owner: row.owner,
        territory: row.territory,
        expectedApplicantGain: row.expectedApplicantGain,
        actualApplicantGain,
        effectiveness: row.effectiveness,
        roiScore: computeRoiScore({
          expectedApplicantGain: row.expectedApplicantGain,
          actualApplicantGain,
          effectiveness: row.effectiveness,
        }),
        status: row.status,
      };
    })
    .sort((a, b) => b.roiScore - a.roiScore || b.actualApplicantGain - a.actualApplicantGain)
    .slice(0, 25);
}

export function buildRecommendationLeaderboardSnapshot(input: {
  generatedAt: string;
  records: RecommendationRecord[];
}): RecommendationLeaderboardSnapshot {
  const typePerformance = buildTypePerformance(input.records);
  const sorted = [...typePerformance].sort((a, b) => b.successRate - a.successRate);
  return {
    generatedAt: input.generatedAt,
    roiLeaderboard: buildRoiLeaderboard(input.records),
    topPerformingTypes: sorted.slice(0, 5),
    worstPerformingTypes: [...sorted].reverse().slice(0, 5),
  };
}

export function buildOwnerPerformanceBreakdown(records: RecommendationRecord[]): {
  byDm: RecommendationOwnerPerformance[];
  byRecruiter: RecommendationOwnerPerformance[];
  byProject: RecommendationOwnerPerformance[];
} {
  return {
    byDm: ownerPerformance(records, "dmName", "dm"),
    byRecruiter: ownerPerformance(records, "recruiter", "recruiter"),
    byProject: ownerPerformance(records, "project", "operations"),
  };
}

export function computeOverallSuccessRate(records: RecommendationRecord[]): number {
  return computeSuccessRate(records.filter((row) => row.effectiveness != null));
}
