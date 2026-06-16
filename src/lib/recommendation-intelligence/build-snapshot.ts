import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import type { ExecutiveAlertFollowUp } from "@/lib/alerts/executive-alert-status-types";
import { buildExecutiveTrustRoiSnapshot } from "@/lib/executive-trust-roi";
import { buildDailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import { summarizeLearnedAdjustments } from "@/lib/recommendation-intelligence/confidence-adjustment";
import {
  buildOwnerPerformanceBreakdown,
  buildRoiLeaderboard,
  buildTypePerformance,
  computeOverallSuccessRate,
} from "@/lib/recommendation-intelligence/build-leaderboard";
import { processRecommendationOutcomes, summarizeActualGain } from "@/lib/recommendation-intelligence/outcome-tracking";
import { syncRecommendationRecords } from "@/lib/recommendation-intelligence/sync-recommendations";
import {
  listRecommendationRecords,
  upsertRecommendationRecords,
} from "@/lib/recommendation-intelligence/store";
import type {
  EffectivenessTrendPoint,
  RecommendationIntelligenceSnapshot,
  RecommendationRecord,
} from "@/lib/recommendation-intelligence/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

export type BuildRecommendationIntelligenceInput = {
  bundle: RecruitingIntelligenceRouteBundle;
  followUps?: ExecutiveAlertFollowUp[];
  referenceMs?: number;
  persist?: boolean;
};

function buildEffectivenessTrends(records: RecommendationRecord[]): EffectivenessTrendPoint[] {
  const buckets = new Map<string, RecommendationRecord[]>();
  for (const row of records) {
    if (!row.effectivenessScoredAt) continue;
    const period = row.effectivenessScoredAt.slice(0, 7);
    const list = buckets.get(period) ?? [];
    list.push(row);
    buckets.set(period, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, scoped]) => {
      const successes = scoped.filter(
        (row) => row.effectiveness === "Highly Effective" || row.effectiveness === "Effective",
      ).length;
      return {
        period,
        successRate: scoped.length > 0 ? Math.round((successes / scoped.length) * 100) : 0,
        trackedCount: scoped.length,
        highlyEffectiveCount: scoped.filter((row) => row.effectiveness === "Highly Effective").length,
      };
    });
}

function buildExecutiveSummary(records: RecommendationRecord[]) {
  const typePerformance = buildTypePerformance(records);
  const sorted = [...typePerformance].sort((a, b) => b.successRate - a.successRate);
  const gains = records
    .filter((row) => row.effectiveness != null)
    .map((row) => summarizeActualGain(row));

  return {
    totalTracked: records.length,
    inProgressCount: records.filter((row) => row.status === "In Progress" || row.status === "Executed").length,
    completedCount: records.filter((row) => row.status === "Completed").length,
    ignoredCount: records.filter((row) => row.status === "Ignored").length,
    overallSuccessRate: computeOverallSuccessRate(records),
    topPerformingType: sorted[0]?.label ?? null,
    worstPerformingType: sorted.length > 0 ? sorted[sorted.length - 1]!.label : null,
    averageApplicantGain:
      gains.length > 0 ? Math.round(gains.reduce((sum, value) => sum + value, 0) / gains.length) : 0,
  };
}

export async function buildRecommendationIntelligenceSnapshot(
  input: BuildRecommendationIntelligenceInput,
): Promise<RecommendationIntelligenceSnapshot> {
  const { bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const followUps = input.followUps ?? [];
  const alerts = buildAlertSnapshot({ bundle }).alerts;

  const autopilot = buildRecruitingAutopilotSnapshot({ bundle, alerts, followUps });
  const dailyPlan = buildDailyActionPlanSnapshot({ bundle, alerts, followUps });

  const existing = await listRecommendationRecords();
  const synced = syncRecommendationRecords({
    bundle,
    autopilotRecommendations: autopilot.all,
    dailyActions: dailyPlan.all,
    alerts,
    existing,
  });

  const processed = processRecommendationOutcomes({
    records: synced,
    bundle,
    referenceMs,
  });

  if (input.persist !== false) {
    await upsertRecommendationRecords(processed);
  }

  const learnedRates = summarizeLearnedAdjustments(processed);

  const typePerformance = buildTypePerformance(processed);
  const sortedTypes = [...typePerformance].sort((a, b) => b.successRate - a.successRate);
  const ownerBreakdown = buildOwnerPerformanceBreakdown(processed);
  const planDate = new Date(referenceMs).toISOString().slice(0, 10);

  return {
    generatedAt: bundle.fetchedAt,
    planDate,
    executiveSummary: buildExecutiveSummary(processed),
    topPerformingTypes: sortedTypes.slice(0, 5),
    worstPerformingTypes: [...sortedTypes].reverse().slice(0, 5),
    successRateByDm: ownerBreakdown.byDm.slice(0, 10),
    successRateByRecruiter: ownerBreakdown.byRecruiter.slice(0, 10),
    successRateByProject: ownerBreakdown.byProject.slice(0, 10),
    roiLeaderboard: buildRoiLeaderboard(processed),
    effectivenessTrends: buildEffectivenessTrends(processed),
    recentRecords: processed
      .sort((a, b) => Date.parse(b.createdDate) - Date.parse(a.createdDate))
      .slice(0, 20),
    learnedConfidenceAdjustments: learnedRates,
    trustRoi: buildExecutiveTrustRoiSnapshot({
      records: processed,
      generatedAt: bundle.fetchedAt,
    }),
  };
}
