import type { CandidateSlaSnapshot } from "@/lib/candidate-action-sla";
import { isMelReadyStatus } from "@/lib/candidate-action-sla";
import type { PaperworkStatus } from "@/lib/candidate-workflow-types";
import type { RecruiterCommandCenterWorkItem } from "@/lib/recruiter-command-center/types";

const PAPERWORK_STATUS_LABELS: Record<PaperworkStatus, string> = {
  not_sent: "Not sent",
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
  failed: "Failed",
};

export function formatPaperworkStatusLabel(status: PaperworkStatus): string {
  return PAPERWORK_STATUS_LABELS[status] ?? status;
}

export function summarizeSlaStatus(input: {
  sla: CandidateSlaSnapshot;
  slaRisk: boolean;
}): string {
  const { sla } = input;
  if (sla.isSnoozed) return "Snoozed";

  const parts: string[] = [];
  if (sla.followUpOverdue) parts.push("Follow-up overdue");
  else if (sla.followUpDueSeverity !== "none") parts.push("Follow-up due soon");

  if (sla.appliedAgingSeverity === "critical") parts.push("Applied aging critical");
  else if (sla.appliedAgingSeverity === "warn") parts.push("Applied aging warning");

  if (sla.paperworkAgingSeverity === "critical") parts.push("Paperwork aging critical");
  else if (sla.paperworkAgingSeverity === "warn") parts.push("Paperwork aging warning");

  if (sla.recruiterInactivitySeverity === "critical") parts.push("Recruiter inactivity critical");
  else if (sla.recruiterInactivitySeverity === "warn") parts.push("Recruiter inactivity warning");

  if (parts.length === 0 && input.slaRisk) return "SLA risk";
  if (parts.length === 0) return "On track";
  return parts.join("; ");
}

function parseExportDateInput(iso: string): Date | null {
  const trimmed = iso.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatExportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const date = parseExportDateInput(iso);
    if (!date) return iso;
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
  } catch {
    return iso;
  }
}

export function splitCandidateExportName(candidateName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = candidateName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, spaceIndex),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}

export type CandidateExportRow = {
  "First name": string;
  "Last name": string;
  Email: string;
  Phone: string;
  City: string;
  State: string;
  "Position applied to": string;
  "Candidate grade": string;
  Confidence: string;
  "Required action": string;
  "Priority score": number;
  "Assigned recruiter": string;
  "DM / territory": string;
  "Current stage": string;
  "SLA status": string;
  "Follow-up due date": string;
  "Paperwork status": string;
  "Ready for MEL": string;
  "Last activity date": string;
  Notes: string;
};

export function mapWorkItemToExportRow(item: RecruiterCommandCenterWorkItem): CandidateExportRow {
  const { firstName, lastName } = splitCandidateExportName(item.candidateName);
  return {
    "First name": firstName,
    "Last name": lastName,
    Email: item.email ?? "",
    Phone: item.phone ?? "",
    City: item.city ?? "",
    State: item.state ?? "",
    "Position applied to": item.positionName,
    "Candidate grade": item.grade,
    Confidence: item.confidencePercent != null ? `${item.confidencePercent}%` : "",
    "Required action": item.nextAction,
    "Priority score": item.priorityScore,
    "Assigned recruiter": item.recruiter,
    "DM / territory": item.assignedDm,
    "Current stage": item.workflowStatus,
    "SLA status": item.slaStatus,
    "Follow-up due date": formatExportDate(item.followUpDueDate),
    "Paperwork status": item.paperworkStatusLabel,
    "Ready for MEL": item.readyForMel ? "Yes" : "No",
    "Last activity date": formatExportDate(item.lastActivityDate),
    Notes: item.notesText,
  };
}

export function buildCandidateExportFilename(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `recruiter-candidates-export-${yyyy}-${mm}-${dd}.xlsx`;
}

