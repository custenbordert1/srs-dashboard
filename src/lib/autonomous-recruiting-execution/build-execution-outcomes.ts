import type { TerritoryCoverageNeed } from "@/lib/autonomous-recruiting-engine/types";
import type { ExecutionCorrelation } from "@/lib/autonomous-recruiting-execution/execution-correlation";
import type { ApplicantPerformanceRow, ExecutionOutcomeMetric } from "@/lib/autonomous-recruiting-execution/types";

const MINUTES_POSTING_EXECUTION = 12;
const MINUTES_HIRING_TASK = 8;
const MINUTES_COVERAGE_ESCALATION = 15;
const MINUTES_REFRESH = 10;

export const EXECUTION_HOURS_SAVED_FORMULA =
  "timeSaved = (completedPosting × 12 + completedHiring × 8 + completedCoverage × 15 + completedRefresh × 10) / 60";

export function buildExecutionOutcomes(input: {
  correlations: ExecutionCorrelation[];
  coverageNeeds: TerritoryCoverageNeed[];
  applicantPerformance: ApplicantPerformanceRow[];
  priorCriticalTerritories?: string[];
}): ExecutionOutcomeMetric[] {
  const completed = input.correlations.filter((row) => row.status === "completed");
  const postingCompleted = completed.filter((row) => row.type === "posting" || row.type === "refresh");
  const hiringCompleted = completed.filter((row) => row.type === "hiring");
  const coverageCompleted = completed.filter((row) => row.type === "coverage");

  const postingAttempts = input.correlations.filter(
    (row) => (row.type === "posting" || row.type === "refresh") && row.status !== "archived",
  );
  const postingSuccessRate =
    postingAttempts.length > 0
      ? Math.round((postingCompleted.length / postingAttempts.length) * 100)
      : 0;

  const totalApplicants = input.applicantPerformance.reduce((sum, row) => sum + row.applicants, 0);
  const totalQualified = input.applicantPerformance.reduce((sum, row) => sum + row.qualified, 0);
  const applicantConversionRate =
    totalApplicants > 0 ? Math.round((totalQualified / totalApplicants) * 100) : 0;

  const minutesSaved =
    postingCompleted.length * MINUTES_POSTING_EXECUTION +
    hiringCompleted.length * MINUTES_HIRING_TASK +
    coverageCompleted.length * MINUTES_COVERAGE_ESCALATION +
    completed.filter((row) => row.type === "refresh").length * MINUTES_REFRESH;
  const timeSaved = Math.round((minutesSaved / 60) * 10) / 10;

  const currentCritical = input.coverageNeeds.filter((row) => row.coverageStatus === "Critical");
  const priorCritical = input.priorCriticalTerritories?.length ?? currentCritical.length;
  const coverageRiskReduction =
    priorCritical > 0
      ? Math.round(((priorCritical - currentCritical.length) / priorCritical) * 100)
      : currentCritical.length === 0
        ? 100
        : 0;

  return [
    {
      id: "posting-success-rate",
      label: "Posting success rate",
      value: postingSuccessRate,
      unit: "%",
      detail: `${postingCompleted.length} of ${postingAttempts.length} posting executions completed`,
    },
    {
      id: "applicant-conversion",
      label: "Applicant conversion",
      value: applicantConversionRate,
      unit: "%",
      detail: `${totalQualified} qualified of ${totalApplicants} applicants monitored`,
    },
    {
      id: "time-saved",
      label: "Execution time saved",
      value: timeSaved,
      unit: "hrs",
      detail: EXECUTION_HOURS_SAVED_FORMULA,
    },
    {
      id: "coverage-risk-reduction",
      label: "Coverage risk reduction",
      value: coverageRiskReduction,
      unit: "%",
      detail: `${currentCritical.length} critical territories remaining`,
    },
    {
      id: "executions-completed",
      label: "Executions completed",
      value: completed.length,
      detail: `${input.correlations.filter((row) => row.status === "failed").length} failed`,
    },
    {
      id: "territories-with-alerts",
      label: "Territories with alerts",
      value: input.applicantPerformance.filter((row) => row.alerts.length > 0).length,
    },
  ];
}
