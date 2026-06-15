import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { paperworkStatusLabel } from "@/lib/candidate-paperwork";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { buildExportCsv, downloadExportCsv } from "@/lib/export-center";
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

export type CandidatesExportMetadata = {
  exportDate: string;
  totalRecords: number;
  filtersApplied: string;
};


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

export function buildCandidatesExportCsv(
  candidates: ScoredCandidateWorkflowRow[],
  metadata?: CandidatesExportMetadata,
): string {
  return buildExportCsv({
    filename: candidatesExportFilename(),
    headers: [...CANDIDATES_EXPORT_HEADERS],
    rows: candidates.map((candidate) => buildCandidatesExportRow(candidate)),
    metadata: metadata
      ? [
          { label: "Total Records", value: String(metadata.totalRecords) },
          { label: "Filters Applied", value: metadata.filtersApplied },
        ]
      : undefined,
    dataAsOf: metadata?.exportDate,
  });
}

export function candidatesExportFilename(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `srs-candidates-export-${year}-${month}-${day}.csv`;
}

export function downloadCandidatesCsv(
  candidates: ScoredCandidateWorkflowRow[],
  metadata?: CandidatesExportMetadata,
): void {
  downloadExportCsv({
    filename: candidatesExportFilename(),
    headers: [...CANDIDATES_EXPORT_HEADERS],
    rows: candidates.map((candidate) => buildCandidatesExportRow(candidate)),
    metadata: metadata
      ? [
          { label: "Total Records", value: String(metadata.totalRecords) },
          { label: "Filters Applied", value: metadata.filtersApplied },
        ]
      : undefined,
    dataAsOf: metadata?.exportDate,
  });
}
