import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { paperworkStatusLabel } from "@/lib/candidate-paperwork";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import type { CandidateMatchLevel } from "@/lib/recruiting-intelligence";

const MATCH_LEVEL_LABELS: Record<CandidateMatchLevel, string> = {
  high: "High match",
  medium: "Medium match",
  low: "Low match",
  no_resume: "No resume",
};

const OPERATIONAL_WORKFLOW_LABELS: Partial<Record<CandidateWorkflowStatus, string>> = {
  Applied: "Needs Review",
  "Needs Review": "Needs Review",
  Qualified: "Needs Recruiter Action",
  "Paperwork Needed": "Awaiting Paperwork",
  "Paperwork Sent": "Awaiting Paperwork",
  Signed: "Signed - Pending Onboarding",
  "Awaiting DD Verification": "Signed - Pending Onboarding",
  "Ready for MEL": "Ready for MEL",
};

export const CANDIDATES_EXPORT_HEADERS = [
  "Candidate name",
  "Email",
  "Phone",
  "Position",
  "City",
  "State",
  "Source",
  "Applied date",
  "Stage",
  "Recruiter",
  "DM",
  "Workflow status",
  "Match score",
  "Next recommended action",
  "Paperwork status",
  "Ready for MEL status",
] as const;

function candidateDisplayName(candidate: ScoredCandidateWorkflowRow): string {
  const name = `${candidate.firstName} ${candidate.lastName}`.trim();
  return name || candidate.email || "Unknown candidate";
}

function formatExportDate(raw: string): string {
  if (!raw.trim()) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export function operationalWorkflowStateForExport(
  candidate: ScoredCandidateWorkflowRow,
): string {
  if (candidate.recruitingActions.priorityList) return "Escalated";
  if (candidate.assignedRecruiter === "Unassigned") return "Awaiting Assignment";
  return OPERATIONAL_WORKFLOW_LABELS[candidate.workflowStatus] ?? candidate.workflowStatus;
}

export function readyForMelExportStatus(candidate: ScoredCandidateWorkflowRow): string {
  if (candidate.workflowStatus === "Loaded in MEL") return "Loaded in MEL";
  if (candidate.workflowStatus === "Ready for MEL") return "Ready for MEL";
  if (candidate.workflowStatus === "Signed") return "Signed — pending MEL";
  return "Not ready";
}

export function formatMatchScoreForExport(candidate: ScoredCandidateWorkflowRow): string {
  const levelLabel = MATCH_LEVEL_LABELS[candidate.matchLevel];
  return `${candidate.matchPercent}% (${levelLabel})`;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCandidatesExportRow(candidate: ScoredCandidateWorkflowRow): string[] {
  return [
    candidateDisplayName(candidate),
    candidate.email ?? "",
    candidate.phone ?? "",
    candidate.positionName ?? "",
    candidate.city ?? "",
    candidate.state ?? "",
    candidate.source ?? "",
    formatExportDate(candidate.appliedDate),
    candidate.stage ?? "",
    candidate.assignedRecruiter ?? "",
    candidate.assignedDM ?? "",
    operationalWorkflowStateForExport(candidate),
    formatMatchScoreForExport(candidate),
    candidate.nextActionNeeded ?? "",
    paperworkStatusLabel(candidate.paperworkStatus),
    readyForMelExportStatus(candidate),
  ];
}

export function buildCandidatesExportCsv(candidates: ScoredCandidateWorkflowRow[]): string {
  const lines = [
    CANDIDATES_EXPORT_HEADERS.map(escapeCsvField).join(","),
    ...candidates.map((candidate) =>
      buildCandidatesExportRow(candidate).map((cell) => escapeCsvField(cell)).join(","),
    ),
  ];
  return lines.join("\r\n");
}

export function candidatesExportFilename(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `srs-candidates-export-${year}-${month}-${day}.csv`;
}

export function downloadCandidatesCsv(candidates: ScoredCandidateWorkflowRow[]): void {
  const csv = buildCandidatesExportCsv(candidates);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = candidatesExportFilename();
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
