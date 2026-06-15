import type { ExecutiveOperationsCenterSnapshot } from "@/lib/executive-operations-center/types";

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function metadataRows(label: string, fetchedAt: string): string[] {
  const exportDate = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  return [
    ["Export", label].map(escapeCsvField).join(","),
    ["Export Date", exportDate].map(escapeCsvField).join(","),
    ["Data As Of", fetchedAt].map(escapeCsvField).join(","),
    "",
  ];
}

function downloadCsv(filename: string, lines: string[]): void {
  const csv = `\uFEFF${lines.join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function exportExecutiveProjectsCsv(
  snapshot: ExecutiveOperationsCenterSnapshot,
): void {
  const headers = [
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
  ];
  const lines = [
    ...metadataRows("Executive Projects", snapshot.fetchedAt),
    headers.map(escapeCsvField).join(","),
    ...snapshot.projectWarRoom.map((row) =>
      [
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
      ]
        .map(escapeCsvField)
        .join(","),
    ),
  ];
  downloadCsv(`executive-projects-${snapshot.fetchedAt.slice(0, 10)}.csv`, lines);
}

export function exportExecutiveTerritoriesCsv(
  snapshot: ExecutiveOperationsCenterSnapshot,
): void {
  const headers = [
    "DM",
    "States",
    "Coverage %",
    "Open Calls",
    "Rep Pool",
    "Risk Score",
    "Risk Tier",
    "Priority Actions",
  ];
  const lines = [
    ...metadataRows("Executive Territories", snapshot.fetchedAt),
    headers.map(escapeCsvField).join(","),
    ...snapshot.territoryWarRoom.map((row) =>
      [
        row.dmName,
        row.states.join("; "),
        String(row.coveragePercent),
        String(row.openCalls),
        String(row.repPool),
        String(row.riskScore),
        row.riskTier,
        row.priorityActions.join(" | "),
      ]
        .map(escapeCsvField)
        .join(","),
    ),
  ];
  downloadCsv(`executive-territories-${snapshot.fetchedAt.slice(0, 10)}.csv`, lines);
}

export function exportExecutiveRecruitersCsv(
  snapshot: ExecutiveOperationsCenterSnapshot,
): void {
  const headers = [
    "Recruiter",
    "Assigned",
    "Follow-Ups Due",
    "Paperwork",
    "Ready for MEL",
    "Workload Score",
    "Status",
    "Recommendation",
  ];
  const lines = [
    ...metadataRows("Executive Recruiters", snapshot.fetchedAt),
    headers.map(escapeCsvField).join(","),
    ...snapshot.recruiterWarRoom.map((row) =>
      [
        row.recruiterName,
        String(row.assignedCandidates),
        String(row.followUpsDue),
        String(row.paperwork),
        String(row.readyForMel),
        String(row.workloadScore),
        row.status,
        row.recommendation,
      ]
        .map(escapeCsvField)
        .join(","),
    ),
  ];
  downloadCsv(`executive-recruiters-${snapshot.fetchedAt.slice(0, 10)}.csv`, lines);
}

export function exportExecutiveActionBoardCsv(
  snapshot: ExecutiveOperationsCenterSnapshot,
): void {
  const headers = [
    "Category",
    "Issue",
    "Impact",
    "Impact Score",
    "Owner",
    "Suggested Action",
    "Due Date",
  ];
  const lines = [
    ...metadataRows("Executive Action Board", snapshot.fetchedAt),
    headers.map(escapeCsvField).join(","),
    ...snapshot.actionBoard.map((row) =>
      [
        row.categoryLabel,
        row.issue,
        row.impact,
        String(row.impactScore),
        row.owner,
        row.suggestedAction,
        row.dueDate ?? "",
      ]
        .map(escapeCsvField)
        .join(","),
    ),
  ];
  downloadCsv(`executive-action-board-${snapshot.fetchedAt.slice(0, 10)}.csv`, lines);
}
