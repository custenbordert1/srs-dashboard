import { filterDailyActionsForRecruiterScope } from "@/lib/recruiter-operating-system/filter-recruiter-scope";
import { buildScopedCandidateRows, candidateDisplayName } from "@/lib/recruiter-operating-system/build-scoped-rows";
import type {
  RecruiterDailyPlanAction,
  RecruiterOperatingSystemScope,
} from "@/lib/recruiter-operating-system/types";
import type { DailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { deriveRecruiterNextAction } from "@/lib/recruiter-candidate-intelligence";
import { scoreCandidatePriority } from "@/lib/recruiter-operating-system/build-candidate-ranking";
import { normalizeStateCode } from "@/lib/dm-territory-map";

const DAILY_PLAN_LIMIT = 25;

export function buildRecruiterDailyPlan(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  dailyActionPlan: DailyActionPlanSnapshot;
  scope: RecruiterOperatingSystemScope;
  referenceMs: number;
}): RecruiterDailyPlanAction[] {
  const platformActions = filterDailyActionsForRecruiterScope(input.dailyActionPlan.all, input.scope).map(
    (action, index) => {
      const opp = input.bundle.opportunities.find((row) =>
        action.title.includes(row.projectName) || action.title.includes(row.storeName),
      );
      return {
        rank: index + 1,
        id: action.id,
        storeName: opp?.storeName,
        projectName: opp?.projectName,
        title: action.title,
        reason: action.reasoning,
        expectedImpact: `+${action.expectedCoverageGain}% coverage · +${action.expectedHireGain} hires · impact ${action.expectedImpact}`,
        recommendedNextStep: action.recommendation.title,
        impactScore: action.expectedImpact,
      };
    },
  );

  const candidateActions = buildScopedCandidateRows(input.bundle, input.scope)
    .map((row) => {
      const score = scoreCandidatePriority(row, input.bundle, input.referenceMs);
      const opp = input.bundle.opportunities.find(
        (item) => normalizeStateCode(item.state) === normalizeStateCode(row.state),
      );
      return {
        rank: 0,
        id: `daily-candidate:${row.candidateId}`,
        candidateId: row.candidateId,
        candidateName: candidateDisplayName(row),
        storeName: opp?.storeName,
        projectName: opp?.projectName,
        title: `Work ${candidateDisplayName(row)}`,
        reason: `${row.workflowStatus} in ${row.city}, ${row.state}`,
        expectedImpact: `Placement likelihood ${Math.min(100, Math.round((row.matchPercent ?? 0) * 0.7 + score * 0.3))}% · territory demand ${score}`,
        recommendedNextStep: deriveRecruiterNextAction(row, input.referenceMs),
        impactScore: score,
      };
    })
    .filter((action) => action.impactScore >= 20);

  const merged = [...platformActions, ...candidateActions]
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, DAILY_PLAN_LIMIT)
    .map((action, index) => ({ ...action, rank: index + 1 }));

  return merged;
}
