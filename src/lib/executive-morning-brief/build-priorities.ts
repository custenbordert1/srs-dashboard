import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import { buildDailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { MorningBriefPriority } from "@/lib/executive-morning-brief/types";

export function buildMorningBriefPriorities(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  alerts: ExecutiveAlert[];
}): MorningBriefPriority[] {
  const { bundle, alerts } = input;
  const dailyPlan = buildDailyActionPlanSnapshot({ bundle, alerts });
  const autopilot = buildRecruitingAutopilotSnapshot({ bundle, alerts, followUps: [] });

  const fromDaily = dailyPlan.all.slice(0, 6).map((item, index) => ({
    rank: index + 1,
    title: item.title,
    impactScore: item.expectedImpact,
    owner: item.owner || null,
    expectedResult: `+${item.expectedCoverageGain}% coverage · +${item.expectedHireGain} hires`,
    recommendedAction: item.reasoning,
    sourceType: "daily-action" as const,
    sourceId: item.alertId,
    territory: item.recommendation.entityLabel ?? null,
  }));

  const fromAutopilot = autopilot.all.slice(0, 6).map((rec, index) => ({
    rank: fromDaily.length + index + 1,
    title: rec.title,
    impactScore: rec.impactScore,
    owner: rec.dmName ?? null,
    expectedResult: `+${rec.opportunity.estimatedCandidateGain} applicants · +${rec.opportunity.estimatedCoverageGain}% coverage`,
    recommendedAction: rec.reasoning,
    sourceType: "autopilot" as const,
    sourceId: rec.id,
    territory: rec.entityLabel ?? null,
  }));

  const combined = [...fromDaily, ...fromAutopilot]
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, 10)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return combined;
}
