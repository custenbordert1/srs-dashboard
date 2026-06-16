import {
  calendarDaysSince,
  hoursSince,
  isFollowUpOverdue,
} from "@/lib/candidate-action-sla";
import { deriveRecruiterNextAction } from "@/lib/recruiter-candidate-intelligence";
import { isNoResponseCandidate } from "@/lib/recruiter-action-queue-filters";
import { buildScopedCandidateRows, candidateDisplayName } from "@/lib/recruiter-operating-system/build-scoped-rows";
import type {
  RecruiterCandidateHeat,
  RecruiterCandidatePriorityRow,
  RecruiterOperatingSystemScope,
  RecruiterOutreachMethod,
} from "@/lib/recruiter-operating-system/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { normalizeStateCode } from "@/lib/dm-territory-map";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

function resolveHeat(score: number): RecruiterCandidateHeat {
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  if (score >= 30) return "cold";
  return "at-risk";
}

function resolveOutreachMethod(
  heat: RecruiterCandidateHeat,
  hasPhone: boolean,
): RecruiterOutreachMethod {
  if (heat === "at-risk") return "dm-escalation";
  if (heat === "hot" && hasPhone) return "call";
  if (heat === "warm") return hasPhone ? "text" : "email";
  return "email";
}

function resolveTiming(heat: RecruiterCandidateHeat, followUpOverdue: boolean): string {
  if (followUpOverdue || heat === "hot") return "Within 1 hour";
  if (heat === "warm") return "Today";
  if (heat === "cold") return "This week";
  return "Escalate today";
}

function territoryDemandScore(
  bundle: RecruitingIntelligenceRouteBundle,
  state: string,
): number {
  const code = normalizeStateCode(state);
  const openCalls = bundle.opportunities.filter(
    (opp) => opp.openStatus && !opp.isStaffed && normalizeStateCode(opp.state) === code,
  ).length;
  const coverageRows = bundle.coverage.opportunities.filter(
    (opp) => normalizeStateCode(opp.state) === code,
  );
  const avgCoverage =
    coverageRows.length > 0
      ? coverageRows.reduce((sum, row) => sum + row.coverageScore, 0) / coverageRows.length
      : 50;
  return Math.min(100, Math.round(openCalls * 8 + (100 - avgCoverage) * 0.4));
}

export function scoreCandidatePriority(
  row: ReturnType<typeof buildScopedCandidateRows>[number],
  bundle: RecruitingIntelligenceRouteBundle,
  referenceMs: number,
): number {
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return 0;

  const activityDays = calendarDaysSince(row.lastActionAt ?? row.appliedDate, referenceMs) ?? 30;
  const appliedDays = calendarDaysSince(row.appliedDate, referenceMs) ?? 30;
  const commHistory = row.history.length;
  const followUpOverdue = isFollowUpOverdue({
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    referenceMs,
  });

  const activityScore = Math.max(0, 30 - activityDays * 2);
  const commScore = Math.min(20, commHistory * 4);
  const recencyScore = Math.max(0, 25 - appliedDays);
  const demandScore = territoryDemandScore(bundle, row.state) * 0.15;
  const aiScore = (row.aiNumericScore ?? 0) * 0.2;
  const followUpBoost = followUpOverdue ? 15 : row.recruitingActions.needsFollowUp ? 8 : 0;
  const noResponsePenalty = isNoResponseCandidate(row, referenceMs) ? 10 : 0;

  return Math.round(
    Math.min(100, activityScore + commScore + recencyScore + demandScore + aiScore + followUpBoost + noResponsePenalty),
  );
}

export function buildCandidatePriorities(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  scope: RecruiterOperatingSystemScope;
  referenceMs: number;
  limit?: number;
}): RecruiterCandidatePriorityRow[] {
  const rows = buildScopedCandidateRows(input.bundle, input.scope);
  const limit = input.limit ?? 50;

  return rows
    .map((row) => {
      const score = scoreCandidatePriority(row, input.bundle, input.referenceMs);
      const heat = resolveHeat(score);
      const followUpOverdue = isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs: input.referenceMs,
      });
      const opp = input.bundle.opportunities.find(
        (item) => normalizeStateCode(item.state) === normalizeStateCode(row.state),
      );

      return {
        candidateId: row.candidateId,
        candidateName: candidateDisplayName(row),
        heat,
        score,
        workflowStatus: row.workflowStatus,
        city: row.city,
        state: row.state,
        projectName: opp?.projectName ?? row.positionName ?? "—",
        storeName: opp?.storeName ?? "—",
        lastActivityAt: row.lastActionAt,
        appliedDate: row.appliedDate,
        recommendedNextAction: deriveRecruiterNextAction(row, input.referenceMs),
        outreachMethod: resolveOutreachMethod(heat, Boolean(row.phone?.trim())),
        recommendedTiming: resolveTiming(heat, followUpOverdue),
        placementLikelihood: Math.min(100, Math.round((row.matchPercent ?? 0) * 0.6 + score * 0.4)),
        territoryDemandScore: territoryDemandScore(input.bundle, row.state),
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.placementLikelihood - a.placementLikelihood)
    .slice(0, limit);
}

export function compareCandidatePriorities(
  a: RecruiterCandidatePriorityRow,
  b: RecruiterCandidatePriorityRow,
): number {
  return b.score - a.score || b.placementLikelihood - a.placementLikelihood;
}
