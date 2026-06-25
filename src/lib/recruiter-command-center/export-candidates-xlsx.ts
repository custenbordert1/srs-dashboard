import {
  buildCandidateExportFilename,
  mapWorkItemToExportRow,
  type CandidateExportRow,
} from "@/lib/recruiter-command-center/format-candidate-export";
import type { RecruiterCommandCenterWorkItem } from "@/lib/recruiter-command-center/types";
import { buildXlsxBuffer, triggerXlsxDownload } from "@/lib/recruiter-command-center/write-xlsx-buffer";

const EXPORT_COLUMN_ORDER: (keyof CandidateExportRow)[] = [
  "First name",
  "Last name",
  "Email",
  "Phone",
  "City",
  "State",
  "Position applied to",
  "Candidate grade",
  "Confidence",
  "Required action",
  "Priority score",
  "Assigned recruiter",
  "DM / territory",
  "Current stage",
  "SLA status",
  "Follow-up due date",
  "Paperwork status",
  "Ready for MEL",
  "Last activity date",
  "Notes",
];

export function buildCandidateExportSheetData(
  items: RecruiterCommandCenterWorkItem[],
): (string | number)[][] {
  const header = EXPORT_COLUMN_ORDER as string[];
  const rows = items.map((item) => {
    const mapped = mapWorkItemToExportRow(item);
    return EXPORT_COLUMN_ORDER.map((key) => mapped[key]);
  });
  return [header, ...rows];
}

export function downloadCandidatesXlsx(
  items: RecruiterCommandCenterWorkItem[],
  filename?: string,
): void {
  if (items.length === 0) return;

  const sheetData = buildCandidateExportSheetData(items);
  const buffer = buildXlsxBuffer(sheetData);
  triggerXlsxDownload(buffer, filename ?? buildCandidateExportFilename());
}
