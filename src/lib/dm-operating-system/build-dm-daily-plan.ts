import { filterDailyActionsForDmScope } from "@/lib/dm-operating-system/filter-territory-scope";
import type { DmDailyPlanAction, DmOperatingSystemScope } from "@/lib/dm-operating-system/types";
import type { DailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan/types";

const DAILY_PLAN_LIMIT = 10;

export function buildDmDailyPlan(input: {
  dailyActionPlan: DailyActionPlanSnapshot;
  scope: DmOperatingSystemScope;
}): DmDailyPlanAction[] {
  const scoped = filterDailyActionsForDmScope(input.dailyActionPlan.all, input.scope);
  const prioritized = [...scoped].sort(
    (a, b) => b.expectedImpact - a.expectedImpact || a.dueDate.localeCompare(b.dueDate),
  );

  return prioritized.slice(0, DAILY_PLAN_LIMIT).map((action, index) => ({
    rank: index + 1,
    id: action.id,
    title: action.title,
    whyItMatters: action.reasoning,
    expectedImpact: `+${action.expectedCoverageGain}% coverage · +${action.expectedHireGain} hires · impact ${action.expectedImpact}`,
    recommendedNextStep: action.recommendation.title,
    owner: action.owner,
    dueDate: action.dueDate,
    expectedCoverageGain: action.expectedCoverageGain,
    expectedHireGain: action.expectedHireGain,
  }));
}
