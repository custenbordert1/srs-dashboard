import {
  calendarDaysSince,
  hoursSince,
  isFollowUpOverdue,
} from "@/lib/candidate-action-sla";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOpportunitySource } from "@/lib/candidate-re-engagement-intelligence/types";
import {
  classifyOpportunitySource,
  territoryImpactScore,
} from "@/lib/candidate-re-engagement-intelligence/opportunity-engine";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

function segmentBoost(source: CandidateOpportunitySource): number {
  switch (source) {
    case "past-worker":
      return 20;
    case "stalled":
      return 15;
    case "unfinished-onboarding":
      return 18;
    case "declined-previously":
      return 12;
    case "abandoned":
      return 10;
    case "inactive":
      return 8;
    default:
      return 8;
  }
}

export function scoreReEngagementOpportunity(
  row: ScoredCandidateWorkflowRow,
  bundle: RecruitingIntelligenceRouteBundle,
  referenceMs: number,
): number {
  const source = classifyOpportunitySource(row, referenceMs);
  if (!source) return 0;

  const matchScore = (row.matchPercent ?? 0) * 0.35;
  const territoryScore = territoryImpactScore(bundle, row.state) * 0.25;
  const inactiveHours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 0;
  const stalenessBoost = Math.min(25, inactiveHours / 24);
  const followUpBoost = isFollowUpOverdue({
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    referenceMs,
  })
    ? 12
    : 0;
  const onboardingBoost = source === "unfinished-onboarding" ? 10 : 0;
  const declinedPenalty = source === "declined-previously" ? -5 : 0;

  return Math.round(
    Math.min(
      100,
      matchScore +
        territoryScore +
        stalenessBoost +
        segmentBoost(source) +
        followUpBoost +
        onboardingBoost +
        declinedPenalty,
    ),
  );
}

export function scorePlacementProbability(
  row: ScoredCandidateWorkflowRow,
  reEngagementScore: number,
): number {
  return Math.min(100, Math.round((row.matchPercent ?? 0) * 0.55 + reEngagementScore * 0.45));
}

export function daysSinceLastTouch(row: ScoredCandidateWorkflowRow, referenceMs: number): number {
  return calendarDaysSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 0;
}
