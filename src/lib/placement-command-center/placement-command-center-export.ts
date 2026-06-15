import { downloadExportCsv } from "@/lib/export-center";
import type { PlacementCommandCenterSnapshot } from "@/lib/placement-command-center/types";

export function exportExecutivePlacementReportCsv(snapshot: PlacementCommandCenterSnapshot): void {
  downloadExportCsv({
    filename: `executive-placement-report-${snapshot.fetchedAt.slice(0, 10)}.csv`,
    dataAsOf: snapshot.fetchedAt,
    metadata: [{ label: "Export", value: "Executive Placement Report" }],
    headers: ["Category", "Label", "Detail", "Metric", "Severity"],
    rows: snapshot.executiveBoard.map((row) => [
      row.category,
      row.label,
      row.detail,
      row.metric,
      row.severity,
    ]),
  });
}

export function exportRecruiterPlacementReportCsv(snapshot: PlacementCommandCenterSnapshot): void {
  downloadExportCsv({
    filename: `recruiter-placement-report-${snapshot.fetchedAt.slice(0, 10)}.csv`,
    dataAsOf: snapshot.fetchedAt,
    metadata: [{ label: "Export", value: "Recruiter Placement Report" }],
    headers: [
      "Recruiter",
      "Placements",
      "Conversion %",
      "Avg Days",
      "MEL Ready",
      "Completions",
      "Score",
    ],
    rows: snapshot.recruiterScorecard.map((row) => [
      row.recruiterName,
      String(row.placements),
      String(row.conversionRatePercent),
      row.avgTimeToPlacementDays != null ? String(row.avgTimeToPlacementDays) : "",
      String(row.melReadyCount),
      String(row.projectCompletions),
      String(row.score),
    ]),
  });
}

export function exportDmCoverageReportCsv(snapshot: PlacementCommandCenterSnapshot): void {
  downloadExportCsv({
    filename: `dm-coverage-report-${snapshot.fetchedAt.slice(0, 10)}.csv`,
    dataAsOf: snapshot.fetchedAt,
    metadata: [{ label: "Export", value: "DM Coverage Report" }],
    headers: [
      "DM",
      "Coverage %",
      "Rep Utilization %",
      "Placement Velocity",
      "Open Call Reduction",
      "Open Calls",
      "Score",
    ],
    rows: snapshot.dmScorecard.map((row) => [
      row.dmName,
      String(row.coveragePercent),
      String(row.repUtilizationPercent),
      String(row.placementVelocity),
      String(row.openCallReduction),
      String(row.openCalls),
      String(row.score),
    ]),
  });
}

export function exportProjectFillForecastCsv(snapshot: PlacementCommandCenterSnapshot): void {
  downloadExportCsv({
    filename: `project-fill-forecast-${snapshot.fetchedAt.slice(0, 10)}.csv`,
    dataAsOf: snapshot.fetchedAt,
    metadata: [{ label: "Export", value: "Project Fill Forecast" }],
    headers: [
      "Project",
      "Client",
      "Current Fill %",
      "Required Fill %",
      "Outcome",
      "Projected Finish",
      "Confidence",
      "Reason",
    ],
    rows: snapshot.projectForecasts.map((row) => [
      row.projectName,
      row.client,
      String(row.currentFillRatePercent),
      String(row.requiredFillRatePercent),
      row.outcome,
      row.projectedFinishDate ?? "",
      String(row.confidenceScore),
      row.reason,
    ]),
  });
}
