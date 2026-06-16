import {
  calendarDaysSince,
  isFollowUpOverdue,
  isMelReadyStatus,
} from "@/lib/candidate-action-sla";
import { isInterviewingStage } from "@/lib/dm-dashboard/territory-shared";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { computeRecruiterProductivityScore } from "@/lib/recruiter-productivity-center/build-recruiter-productivity-snapshot";
import { buildScopedCandidateRows } from "@/lib/recruiter-operating-system/build-scoped-rows";
import type {
  RecruiterOperatingSystemKpis,
  RecruiterOperatingSystemScope,
} from "@/lib/recruiter-operating-system/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildRecruiterProductivityLive } from "@/lib/recruiting-automation/recruiter-productivity-live";

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

export function buildRecruiterOperatingSystemKpis(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  scope: RecruiterOperatingSystemScope;
  referenceMs: number;
}): RecruiterOperatingSystemKpis {
  const { bundle, scope, referenceMs } = input;
  const rows = buildScopedCandidateRows(bundle, scope);
  const activeCandidates = rows.filter((row) => !TERMINAL_STATUSES.has(row.workflowStatus)).length;
  const candidatesRequiringFollowUp = rows.filter(
    (row) =>
      row.recruitingActions.needsFollowUp ||
      isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs,
      }),
  ).length;
  const readyForPlacementCandidates = rows.filter((row) => isMelReadyStatus(row.workflowStatus)).length;
  const interviewsScheduled = rows.filter((row) => isInterviewingStage(row.stage)).length;

  const recruiterStates = new Set(rows.map((row) => normalizeStateCode(row.state)).filter((s) => s.length === 2));
  const assignedOpenCalls = bundle.opportunities.filter(
    (opp) =>
      opp.openStatus &&
      !opp.isStaffed &&
      (recruiterStates.size === 0 || recruiterStates.has(normalizeStateCode(opp.state))),
  ).length;

  const productivityRows = buildRecruiterProductivityLive(
    bundle.candidates,
    bundle.workflows,
    bundle.fetchedAt,
  );
  const scopedProductivity = scope.scopedToRecruiter
    ? productivityRows.filter(
        (row) => row.recruiter.toLowerCase() === scope.recruiterName.toLowerCase(),
      )
    : productivityRows;

  const territoryCoverageImpact =
    scope.territoryStates.length > 0
      ? Math.round(
          bundle.coverage.opportunities
            .filter((opp) => scope.territoryStates.includes(normalizeStateCode(opp.state)))
            .reduce((sum, opp) => sum + opp.coverageScore, 0) /
            Math.max(
              1,
              bundle.coverage.opportunities.filter((opp) =>
                scope.territoryStates.includes(normalizeStateCode(opp.state)),
              ).length,
            ),
        )
      : Math.round(bundle.coverage.executiveSummary.averageCoverageScore);

  const scorecards = scopedProductivity.map((row) => ({
    recruiter: row.recruiter,
    assignedCount: row.candidatesReviewed,
    contactRatePercent: row.conversionPercent,
    paperworkConversionPercent: row.conversionPercent,
    hireConversionPercent: row.conversionPercent,
    avgTimeToFirstContactHours: row.avgResponseDays !== null ? row.avgResponseDays * 24 : null,
    avgDaysToHire: null,
  }));

  return {
    assignedOpenCalls,
    activeCandidates,
    candidatesRequiringFollowUp,
    readyForPlacementCandidates,
    interviewsScheduled,
    territoryCoverageImpact,
    recruiterProductivityScore: computeRecruiterProductivityScore(scorecards),
  };
}
