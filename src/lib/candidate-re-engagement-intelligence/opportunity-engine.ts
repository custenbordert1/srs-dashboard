import {
  calendarDaysSince,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isHiredStage } from "@/lib/dm-dashboard/territory-shared";
import { isNoResponseCandidate } from "@/lib/recruiter-action-queue-filters";
import { buildScopedCandidateRows, candidateDisplayName } from "@/lib/recruiter-operating-system/build-scoped-rows";
import { scorePlacementProbability, scoreReEngagementOpportunity } from "@/lib/candidate-re-engagement-intelligence/scoring";
import type { RecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOpportunitySource } from "@/lib/candidate-re-engagement-intelligence/types";

const STALLED_DAYS = 14;
const ABANDONED_DAYS = 30;
const INACTIVE_DAYS = 7;

export function classifyOpportunitySource(
  row: ScoredCandidateWorkflowRow,
  referenceMs: number,
): CandidateOpportunitySource | null {
  if (isHiredStage(row.stage) || row.workflowStatus === "Active Rep") return "past-worker";
  if (row.workflowStatus === "Not Qualified") return "declined-previously";
  if (isPaperworkPendingStatus(row.workflowStatus)) return "unfinished-onboarding";

  const inactiveDays = calendarDaysSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 0;
  if (inactiveDays >= ABANDONED_DAYS) return "abandoned";
  if (inactiveDays >= STALLED_DAYS || isNoResponseCandidate(row, referenceMs)) return "stalled";
  if (inactiveDays >= INACTIVE_DAYS) return "inactive";

  const appliedDays = calendarDaysSince(row.appliedDate, referenceMs) ?? 0;
  if (appliedDays >= 7 && !row.lastActionAt) return "previous-applicant";
  if (row.workflowStatus === "Applied" && appliedDays >= 5) return "previous-applicant";

  return null;
}

export function territoryOpenCalls(
  bundle: RecruitingIntelligenceRouteBundle,
  state: string,
): number {
  const code = normalizeStateCode(state);
  return bundle.opportunities.filter(
    (opp) => opp.openStatus && !opp.isStaffed && normalizeStateCode(opp.state) === code,
  ).length;
}

export function territoryImpactScore(
  bundle: RecruitingIntelligenceRouteBundle,
  state: string,
): number {
  return Math.min(100, territoryOpenCalls(bundle, state) * 15);
}

export function projectImpactScore(
  bundle: RecruitingIntelligenceRouteBundle,
  row: ScoredCandidateWorkflowRow,
): number {
  const code = normalizeStateCode(row.state);
  const city = row.city?.trim().toLowerCase() ?? "";
  const matching = bundle.opportunities.filter((opp) => {
    if (!opp.openStatus || opp.isStaffed) return false;
    if (normalizeStateCode(opp.state) !== code) return false;
    if (!city) return true;
    return opp.city?.trim().toLowerCase() === city;
  });
  if (matching.length === 0) return Math.round(territoryImpactScore(bundle, row.state) * 0.4);
  const highPriority = matching.filter((opp) => opp.priority?.toLowerCase() === "high").length;
  return Math.min(100, matching.length * 12 + highPriority * 10);
}

function resolveProjectContext(
  bundle: RecruitingIntelligenceRouteBundle,
  row: ScoredCandidateWorkflowRow,
): { projectName: string; storeName: string } {
  const code = normalizeStateCode(row.state);
  const city = row.city?.trim().toLowerCase() ?? "";
  const match =
    bundle.opportunities.find(
      (opp) =>
        opp.openStatus &&
        !opp.isStaffed &&
        normalizeStateCode(opp.state) === code &&
        (!city || opp.city?.trim().toLowerCase() === city),
    ) ??
    bundle.opportunities.find(
      (opp) => opp.openStatus && !opp.isStaffed && normalizeStateCode(opp.state) === code,
    );

  return {
    projectName: match?.projectName ?? "Open territory",
    storeName: match?.storeName ?? "—",
  };
}

export type RawReEngagementOpportunity = {
  row: ScoredCandidateWorkflowRow;
  source: CandidateOpportunitySource;
  reEngagementScore: number;
  placementProbability: number;
  territoryImpact: number;
  projectImpact: number;
  projectName: string;
  storeName: string;
};

export function buildRawReEngagementOpportunities(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  scope: RecruiterOperatingSystemScope;
  referenceMs: number;
}): RawReEngagementOpportunity[] {
  const rows = buildScopedCandidateRows(input.bundle, input.scope);
  const results: RawReEngagementOpportunity[] = [];

  for (const row of rows) {
    const source = classifyOpportunitySource(row, input.referenceMs);
    if (!source) continue;

    const reEngagementScore = scoreReEngagementOpportunity(row, input.bundle, input.referenceMs);
    if (reEngagementScore < 10) continue;

    const { projectName, storeName } = resolveProjectContext(input.bundle, row);
    const territoryImpact = territoryImpactScore(input.bundle, row.state);
    const projectImpact = projectImpactScore(input.bundle, row);
    const placementProbability = scorePlacementProbability(row, reEngagementScore);

    results.push({
      row,
      source,
      reEngagementScore,
      placementProbability,
      territoryImpact,
      projectImpact,
      projectName,
      storeName,
    });
  }

  return results;
}

export function defaultRecommendedAction(source: CandidateOpportunitySource): string {
  switch (source) {
    case "past-worker":
      return "Invite back for open territory call";
    case "declined-previously":
      return "Re-open with updated pay and project fit";
    case "unfinished-onboarding":
      return "Resume onboarding and clear paperwork blockers";
    case "abandoned":
      return "Send re-engagement outreach with updated pay/project";
    case "stalled":
      return "Call to restart conversation and confirm interest";
    case "inactive":
      return "Light-touch check-in to confirm availability";
    default:
      return "Reach out to confirm interest and territory fit";
  }
}

export { candidateDisplayName };
