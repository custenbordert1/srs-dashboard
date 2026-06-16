import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { buildDailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import {
  buildRoiLeaderboard,
  buildTypePerformance,
  computeOverallSuccessRate,
} from "@/lib/recommendation-intelligence/build-leaderboard";
import { processRecommendationOutcomes } from "@/lib/recommendation-intelligence/outcome-tracking";
import { listRecommendationRecords, upsertRecommendationRecords } from "@/lib/recommendation-intelligence/store";
import { syncRecommendationRecords } from "@/lib/recommendation-intelligence/sync-recommendations";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { RecommendationTypeSummary } from "@/lib/executive-morning-brief/types";

function mapTypePerformance(rows: ReturnType<typeof buildTypePerformance>): RecommendationTypeSummary[] {
  return rows.map((row) => ({
    recommendationType: row.recommendationType,
    label: row.label,
    successRate: row.successRate,
    trackedCount: row.totalTracked,
    trendChange: row.averageApplicantGain > 0 ? 1 : row.averageApplicantGain < 0 ? -1 : 0,
  }));
}

export async function buildRecommendationIntelligenceSection(
  bundle: RecruitingIntelligenceRouteBundle,
  persist = true,
) {
  const alerts = buildAlertSnapshot({ bundle }).alerts;
  const autopilot = buildRecruitingAutopilotSnapshot({ bundle, alerts, followUps: [] });
  const dailyPlan = buildDailyActionPlanSnapshot({ bundle, alerts });

  let records = await listRecommendationRecords();
  const synced = syncRecommendationRecords({
    bundle,
    autopilotRecommendations: autopilot.all,
    dailyActions: dailyPlan.all,
    alerts,
    existing: records,
  });
  records = processRecommendationOutcomes({ bundle, records: synced });
  if (persist) await upsertRecommendationRecords(records);

  const typePerformance = buildTypePerformance(records);
  const sorted = [...typePerformance].sort((a, b) => b.successRate - a.successRate);
  const roi = buildRoiLeaderboard(records).slice(0, 5);

  return {
    topPerforming: mapTypePerformance(sorted.slice(0, 5)),
    worstPerforming: mapTypePerformance([...sorted].reverse().slice(0, 5)),
    overallSuccessRate: computeOverallSuccessRate(records),
    roiHighlights: roi.map((row) => ({
      recommendationId: row.recommendationId,
      label: row.label,
      effectiveness: row.effectiveness,
      roiScore: row.roiScore,
    })),
  };
}
