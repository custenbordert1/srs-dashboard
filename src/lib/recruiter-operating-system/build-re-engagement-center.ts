import {
  calendarDaysSince,
  hoursSince,
  isFollowUpOverdue,
} from "@/lib/candidate-action-sla";
import { isHiredStage } from "@/lib/dm-dashboard/territory-shared";
import { isNoResponseCandidate } from "@/lib/recruiter-action-queue-filters";
import { buildScopedCandidateRows, candidateDisplayName } from "@/lib/recruiter-operating-system/build-scoped-rows";
import type {
  ReEngagementCandidate,
  ReEngagementSegment,
  RecruiterOperatingSystemScope,
} from "@/lib/recruiter-operating-system/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { normalizeStateCode } from "@/lib/dm-territory-map";

const STALLED_DAYS = 14;
const ABANDONED_DAYS = 30;

function classifySegment(
  row: ReturnType<typeof buildScopedCandidateRows>[number],
  referenceMs: number,
): ReEngagementSegment | null {
  if (isHiredStage(row.stage) || row.workflowStatus === "Active Rep") return "past-worker";
  const inactiveDays = calendarDaysSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 0;
  if (inactiveDays >= ABANDONED_DAYS) return "abandoned";
  if (inactiveDays >= STALLED_DAYS || isNoResponseCandidate(row, referenceMs)) return "stalled";
  const appliedDays = calendarDaysSince(row.appliedDate, referenceMs) ?? 0;
  if (appliedDays >= 7 && !row.lastActionAt) return "previous-applicant";
  if (row.workflowStatus === "Not Qualified") return "previous-applicant";
  return null;
}

function territoryImpact(
  bundle: RecruitingIntelligenceRouteBundle,
  state: string,
): number {
  const code = normalizeStateCode(state);
  const openCalls = bundle.opportunities.filter(
    (opp) => opp.openStatus && !opp.isStaffed && normalizeStateCode(opp.state) === code,
  ).length;
  return Math.min(100, openCalls * 15);
}

export function scoreReEngagementOpportunity(
  row: ReturnType<typeof buildScopedCandidateRows>[number],
  bundle: RecruitingIntelligenceRouteBundle,
  referenceMs: number,
): number {
  const segment = classifySegment(row, referenceMs);
  if (!segment) return 0;

  const matchScore = (row.matchPercent ?? 0) * 0.35;
  const territoryScore = territoryImpact(bundle, row.state) * 0.25;
  const inactiveHours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 0;
  const stalenessBoost = Math.min(25, inactiveHours / 24);
  const segmentBoost =
    segment === "past-worker" ? 20 : segment === "stalled" ? 15 : segment === "abandoned" ? 10 : 8;
  const followUpBoost = isFollowUpOverdue({
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    referenceMs,
  })
    ? 12
    : 0;

  return Math.round(Math.min(100, matchScore + territoryScore + stalenessBoost + segmentBoost + followUpBoost));
}

export function buildReEngagementCenter(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  scope: RecruiterOperatingSystemScope;
  referenceMs: number;
  limit?: number;
}): ReEngagementCandidate[] {
  const limit = input.limit ?? 40;
  const rows = buildScopedCandidateRows(input.bundle, input.scope);
  const results: ReEngagementCandidate[] = [];

  for (const row of rows) {
    const segment = classifySegment(row, input.referenceMs);
    if (!segment) continue;
    const opportunityScore = scoreReEngagementOpportunity(row, input.bundle, input.referenceMs);
    if (opportunityScore < 15) continue;

    results.push({
      candidateId: row.candidateId,
      candidateName: candidateDisplayName(row),
      segment,
      opportunityScore,
      placementLikelihood: Math.min(100, Math.round((row.matchPercent ?? 0) * 0.65 + opportunityScore * 0.35)),
      territoryImpact: territoryImpact(input.bundle, row.state),
      lastTouchAt: row.lastActionAt,
      appliedDate: row.appliedDate,
      city: row.city,
      state: row.state,
      recommendedAction:
        segment === "past-worker"
          ? "Invite back for open territory call"
          : segment === "abandoned"
            ? "Send re-engagement outreach with updated pay/project"
            : "Call to restart conversation and confirm interest",
    });
  }

  return results.sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, limit);
}
