import { rankPlansByOptimization } from "@/lib/autonomous-recruiting-planner/optimization-ranking";
import type {
  ExecutiveStrategyView,
  RecruitingPlan,
  StrategyTradeOff,
} from "@/lib/autonomous-recruiting-planner/types";

export function buildExecutiveStrategyView(plans: RecruitingPlan[]): ExecutiveStrategyView {
  const ranked = rankPlansByOptimization(plans);
  const bestPlan = ranked[0] ?? plans[0]!;
  const alternativePlans = ranked.slice(1, 3);

  const tradeOffs: StrategyTradeOff[] = [];
  if (alternativePlans[0]) {
    const alt = alternativePlans[0];
    tradeOffs.push({
      dimension: "Coverage vs speed",
      bestPlanValue: `${bestPlan.outcomes.coveragePercent}% coverage in ${bestPlan.horizon}`,
      alternativeValue: `${alt.outcomes.coveragePercent}% coverage in ${alt.horizon}`,
      tradeOff: bestPlan.horizon === "7d" ? "Faster results, lower total coverage gain" : "Higher coverage, longer runway",
    });
    tradeOffs.push({
      dimension: "Hires vs risk",
      bestPlanValue: `${bestPlan.outcomes.expectedHires} hires, ${bestPlan.outcomes.riskReduction}% risk reduction`,
      alternativeValue: `${alt.outcomes.expectedHires} hires, ${alt.outcomes.riskReduction}% risk reduction`,
      tradeOff:
        bestPlan.outcomes.riskReduction >= alt.outcomes.riskReduction
          ? "Best plan prioritizes risk reduction"
          : "Alternative trades risk reduction for hire volume",
    });
  }

  const expectedOutcomes = [
    `Projected coverage: ${bestPlan.outcomes.coveragePercent}%`,
    `Expected hires: ${bestPlan.outcomes.expectedHires}`,
    `Open calls reduced: ${bestPlan.outcomes.openCallsReduced}`,
    `Completion rate: ${bestPlan.outcomes.completionPercent}%`,
    `Critical territories remaining: ${bestPlan.outcomes.criticalTerritories}`,
  ];

  return {
    bestPlan,
    alternativePlans,
    tradeOffs,
    expectedOutcomes,
    headline: `Recommended: ${bestPlan.label} — ${bestPlan.headline}`,
  };
}
