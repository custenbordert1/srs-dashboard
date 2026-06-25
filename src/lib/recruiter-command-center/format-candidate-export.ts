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

export function formatExportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export type CandidateExportRow = {
  "Candidate name": string;
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
  return {
    "Candidate name": item.candidateName,
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

