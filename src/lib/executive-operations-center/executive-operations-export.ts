import { downloadExportCsv } from "@/lib/export-center";
import type { ExecutiveOperationsCenterSnapshot } from "@/lib/executive-operations-center/types";

export function exportExecutiveProjectsCsv(snapshot: ExecutiveOperationsCenterSnapshot): void {
  downloadExportCsv({
    filename: `executive-projects-${snapshot.fetchedAt.slice(0, 10)}.csv`,
    dataAsOf: snapshot.fetchedAt,
    metadata: [{ label: "Export", value: "Executive Projects" }],
    headers: [
      "Project",
      "Client",
      "State",
      "DM",
      "Open Calls",
      "Coverage %",
      "Applicants",
      "Risk Level",
      "Owner",
      "Recommendation",
    ],
    rows: snapshot.projectWarRoom.map((row) => [
      row.projectName,
      row.client,
      row.state,
      row.dmName,
      String(row.openCalls),
      String(row.coveragePercent),
      String(row.applicantCount),
      row.riskLevel,
      row.owner,
      row.recommendation,
    ]),
  });
}

export function exportExecutiveTerritoriesCsv(snapshot: ExecutiveOperationsCenterSnapshot): void {
  downloadExportCsv({
    filename: `executive-territories-${snapshot.fetchedAt.slice(0, 10)}.csv`,
    dataAsOf: snapshot.fetchedAt,
    metadata: [{ label: "Export", value: "Executive Territories" }],
    headers: [
      "DM",
      "States",
      "Coverage %",
      "Open Calls",
      "Rep Pool",
      "Risk Score",
      "Risk Tier",
      "Priority Actions",
    ],
    rows: snapshot.territoryWarRoom.map((row) => [
      row.dmName,
      row.states.join("; "),
      String(row.coveragePercent),
      String(row.openCalls),
      String(row.repPool),
      String(row.riskScore),
      row.riskTier,
      row.priorityActions.join(" | "),
    ]),
  });
}

export function exportExecutiveRecruitersCsv(snapshot: ExecutiveOperationsCenterSnapshot): void {
  downloadExportCsv({
    filename: `executive-recruiters-${snapshot.fetchedAt.slice(0, 10)}.csv`,
    dataAsOf: snapshot.fetchedAt,
    metadata: [{ label: "Export", value: "Executive Recruiters" }],
    headers: [
      "Recruiter",
      "Assigned",
      "Follow-Ups Due",
      "Paperwork",
      "Ready for MEL",
      "Workload Score",
      "Status",
      "Recommendation",
    ],
    rows: snapshot.recruiterWarRoom.map((row) => [
      row.recruiterName,
      String(row.assignedCandidates),
      String(row.followUpsDue),
      String(row.paperwork),
      String(row.readyForMel),
      String(row.workloadScore),
      row.status,
      row.recommendation,
    ]),
  });
}

export function exportExecutiveActionBoardCsv(snapshot: ExecutiveOperationsCenterSnapshot): void {
  downloadExportCsv({
    filename: `executive-action-board-${snapshot.fetchedAt.slice(0, 10)}.csv`,
    dataAsOf: snapshot.fetchedAt,
    metadata: [{ label: "Export", value: "Executive Action Board" }],
    headers: [
      "Category",
      "Issue",
      "Impact",
      "Impact Score",
      "Owner",
      "Suggested Action",
      "Due Date",
    ],
    rows: snapshot.actionBoard.map((row) => [
      row.categoryLabel,
      row.issue,
      row.impact,
      String(row.impactScore),
      row.owner,
      row.suggestedAction,
      row.dueDate ?? "",
    ]),
  });
}
