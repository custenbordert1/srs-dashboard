import { calendarDaysSince } from "@/lib/candidate-action-sla";
import { isHiredStage } from "@/lib/dm-dashboard/territory-shared";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { buildScopedCandidateRows } from "@/lib/recruiter-operating-system/build-scoped-rows";
import type {
  RecruiterOperatingSystemScope,
  RecruiterProductivityTrend,
} from "@/lib/recruiter-operating-system/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function withinHorizon(iso: string | null, referenceMs: number, days: number): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return referenceMs - ts <= days * MS_PER_DAY;
}

function countHistoryActions(
  rows: ReturnType<typeof buildScopedCandidateRows>,
  referenceMs: number,
  days: number,
): number {
  let count = 0;
  for (const row of rows) {
    for (const entry of row.history) {
      if (withinHorizon(entry.createdAt, referenceMs, days)) count += 1;
    }
    if (withinHorizon(row.lastActionAt, referenceMs, days)) count += 1;
  }
  return count;
}

export function buildRecruiterProductivityMetrics(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  scope: RecruiterOperatingSystemScope;
  referenceMs: number;
}): RecruiterProductivityTrend[] {
  const rows = buildScopedCandidateRows(input.bundle, input.scope);
  const horizons: Array<RecruiterProductivityTrend["horizon"]> = ["7d", "30d", "90d"];
  const horizonDays = { "7d": 7, "30d": 30, "90d": 90 } as const;

  return horizons.map((horizon) => {
    const days = horizonDays[horizon];
    const callsCompleted = countHistoryActions(rows, input.referenceMs, days);
    const followUpsCompleted = rows.filter(
      (row) =>
        withinHorizon(row.lastActionAt, input.referenceMs, days) &&
        (row.recruitingActions.needsFollowUp === false || Boolean(row.followUpDueAt)),
    ).length;
    const candidatesMovedForward = rows.filter(
      (row) =>
        withinHorizon(row.lastActionAt, input.referenceMs, days) &&
        ["Qualified", "Paperwork Sent", "Signed", "Ready for MEL", "Active Rep"].includes(row.workflowStatus),
    ).length;
    const placementsInfluenced = rows.filter(
      (row) =>
        (withinHorizon(row.paperworkSignedAt, input.referenceMs, days) ||
          withinHorizon(row.lastActionAt, input.referenceMs, days)) &&
        (isHiredStage(row.stage) || row.workflowStatus === "Active Rep"),
    ).length;

    const recruiterStates = new Set(rows.map((row) => normalizeStateCode(row.state)).filter((s) => s.length === 2));
    const openCalls = input.bundle.opportunities.filter(
      (opp) =>
        opp.openStatus &&
        !opp.isStaffed &&
        (recruiterStates.size === 0 || recruiterStates.has(normalizeStateCode(opp.state))),
    ).length;
    const coverageContribution = Math.min(
      100,
      Math.round(
        (candidatesMovedForward * 8 + placementsInfluenced * 15) /
          Math.max(1, openCalls || 1),
      ),
    );

    return {
      horizon,
      callsCompleted,
      followUpsCompleted,
      candidatesMovedForward,
      placementsInfluenced,
      coverageContribution,
    };
  });
}
