import type {
  ApprovalRule,
  RecommendedAd,
  TerritoryCoverageNeed,
} from "@/lib/autonomous-recruiting-engine/types";

export const DEFAULT_APPROVAL_RULES: ApprovalRule[] = [
  {
    id: "rule-coverage-auto-post",
    name: "Auto-approve urgent posting when coverage critical and applicants low",
    status: "enabled",
    condition: {
      coverageNeedScoreMin: 80,
      applicantCountMax: 5,
      adType: "create-new-ad",
      priority: "high",
    },
    action: "auto-approve",
    successRate: 0,
    triggerCount: 0,
    successCount: 0,
  },
  {
    id: "rule-refresh-stalled-ad",
    name: "Auto-approve refresh for high-priority stalled ads in watch territories",
    status: "enabled",
    condition: {
      coverageNeedScoreMin: 40,
      adType: "refresh-ad",
      priority: "medium",
    },
    action: "auto-approve",
    successRate: 0,
    triggerCount: 0,
    successCount: 0,
  },
];

type EvaluateContext = {
  coverageNeeds: TerritoryCoverageNeed[];
  applicantCountByTerritory: Map<string, number>;
};

function territoryApplicantCount(ctx: EvaluateContext, territory: string): number {
  return ctx.applicantCountByTerritory.get(territory) ?? 0;
}

function coverageScoreForTerritory(ctx: EvaluateContext, territory: string): number {
  const need = ctx.coverageNeeds.find(
    (row) => row.territoryKey === territory || row.dmName === territory || row.territoryLabel.includes(territory),
  );
  return need?.coverageNeedScore ?? 0;
}

function ruleMatches(rule: ApprovalRule, ad: RecommendedAd, ctx: EvaluateContext): boolean {
  if (rule.status !== "enabled") return false;
  const { condition } = rule;

  if (condition.adType && condition.adType !== ad.adType) return false;
  if (condition.priority && condition.priority !== ad.priority) return false;

  const coverageScore = ad.coverageNeedScore ?? coverageScoreForTerritory(ctx, ad.territory);
  if (condition.coverageNeedScoreMin !== undefined && coverageScore < condition.coverageNeedScoreMin) {
    return false;
  }

  const applicants = territoryApplicantCount(ctx, ad.territory);
  if (condition.applicantCountMax !== undefined && applicants > condition.applicantCountMax) {
    return false;
  }

  return true;
}

export function evaluateApprovalRules(
  ads: RecommendedAd[],
  rules: ApprovalRule[],
  ctx: EvaluateContext,
): { ads: RecommendedAd[]; matchedRuleIds: string[] } {
  const matchedRuleIds: string[] = [];
  const evaluated = ads.map((ad) => {
    if (ad.adType === "close-pause-ad") {
      return { ...ad, approvalStatus: "pending" as const };
    }

    const matchingRule = rules.find((rule) => ruleMatches(rule, ad, ctx));
    if (!matchingRule) return ad;

    matchedRuleIds.push(matchingRule.id);
    return { ...ad, approvalStatus: "auto-approved" as const };
  });

  return { ads: evaluated, matchedRuleIds };
}

export function applyApprovalRulesToAds(
  ads: RecommendedAd[],
  rules: ApprovalRule[],
  coverageNeeds: TerritoryCoverageNeed[],
): RecommendedAd[] {
  const applicantCountByTerritory = new Map(
    coverageNeeds.map((row) => [row.territoryKey, row.applicantCount]),
  );
  return evaluateApprovalRules(ads, rules, { coverageNeeds, applicantCountByTerritory }).ads;
}
