import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import type { BreezyJob } from "@/lib/breezy-api";
import {
  buildPositionMatcher,
  normalizeExportApplicantRow,
} from "@/lib/p175-breezy-export-import/normalize";
import type { BreezyExportNormalizedRow } from "@/lib/p175-breezy-export-import/types";
import { BREEZY_EXPORT_APPLICANTS_SHEET } from "@/lib/p175-breezy-export-import/types";

export function loadBreezyExportWorkbookFromDisk(workbookPath: string): {
  rows: BreezyExportNormalizedRow[];
  skipped: number;
  skipReasons: Array<{ rowNumber: number; reason: string }>;
} {
  const wb = XLSX.readFile(workbookPath);
  const sheet = wb.Sheets[BREEZY_EXPORT_APPLICANTS_SHEET];
  if (!sheet) {
    throw new Error(`Missing sheet "${BREEZY_EXPORT_APPLICANTS_SHEET}" in ${workbookPath}`);
  }
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return normalizeExportRows(rawRows, []);
}

export function normalizeExportRows(
  rawRows: Record<string, unknown>[],
  jobs: BreezyJob[],
): {
  rows: BreezyExportNormalizedRow[];
  skipped: number;
  skipReasons: Array<{ rowNumber: number; reason: string }>;
} {
  const matchPosition = buildPositionMatcher(jobs);
  const rows: BreezyExportNormalizedRow[] = [];
  const skipReasons: Array<{ rowNumber: number; reason: string }> = [];

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const normalized = normalizeExportApplicantRow({ rowNumber, raw, matchPosition });
    if ("skipReason" in normalized) {
      skipReasons.push({ rowNumber, reason: normalized.skipReason });
      return;
    }
    rows.push(normalized);
  });

  return { rows, skipped: skipReasons.length, skipReasons };
}

export function readWorkbookBuffer(workbookPath: string): Record<string, unknown>[] {
  const wb = XLSX.readFile(workbookPath);
  const sheet = wb.Sheets[BREEZY_EXPORT_APPLICANTS_SHEET];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

export function assertWorkbookExists(workbookPath: string): void {
  readFileSync(workbookPath);
}
