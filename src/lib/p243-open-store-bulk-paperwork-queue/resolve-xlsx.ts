import { existsSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  cellString,
  normalizeCity,
  normalizeState,
  sanitizeSpecialChars,
} from "@/lib/open-stores-paperwork-send/normalize";
import type { P243OsbpqSheetRow } from "@/lib/p243-open-store-bulk-paperwork-queue/types";

const WORKBOOK_NAMES = [
  "Open_Store_Candidate_Matches.xlsx",
  "Open_Store_Candidate_Matches..xlsx",
];

function candidateSearchRoots(): string[] {
  const home = process.env.HOME ?? "";
  const cwd = process.cwd();
  return [
    cwd,
    path.join(cwd, "artifacts"),
    path.join(cwd, "data"),
    path.join(cwd, "diagnostics"),
    home ? path.join(home, "Desktop") : "",
    home ? path.join(home, "Downloads") : "",
    home ? path.join(home, "Documents") : "",
  ].filter(Boolean);
}

export function resolveOpenStoreMatchesXlsxPath(explicit?: string | null): string | null {
  if (explicit?.trim()) {
    const p = path.resolve(explicit.trim());
    return existsSync(p) ? p : null;
  }
  for (const root of candidateSearchRoots()) {
    for (const name of WORKBOOK_NAMES) {
      const p = path.join(root, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export function defaultOpenStoreMatchesXlsxHint(): string {
  return path.join(process.cwd(), "artifacts", WORKBOOK_NAMES[0]!);
}

function normalizePhone(raw: unknown): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

function normalizeEmail(raw: unknown): string | null {
  const email = cellString(raw).toLowerCase();
  return email.includes("@") ? email : null;
}

/** Extract "CITY, ST" from position titles like "… – BABCOCK RANCH, FL". */
export function parseCityStateFromPosition(position: string): {
  city: string;
  state: string;
} {
  const cleaned = sanitizeSpecialChars(position);
  const m = cleaned.match(/[-–—]\s*([^,]+),\s*([A-Za-z]{2})\s*$/);
  if (m) {
    return { city: normalizeCity(m[1] ?? ""), state: normalizeState(m[2] ?? "") };
  }
  // Hanover Shopping District style — no trailing city
  return { city: "", state: "" };
}

function pickColumn(row: Record<string, unknown>, aliases: string[]): unknown {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const hit = keys.find((k) => k.trim().toLowerCase() === alias.toLowerCase());
    if (hit != null && row[hit] != null && String(row[hit]).trim() !== "") {
      return row[hit];
    }
  }
  // Fuzzy contains
  for (const alias of aliases) {
    const hit = keys.find((k) => k.trim().toLowerCase().includes(alias.toLowerCase()));
    if (hit != null && row[hit] != null && String(row[hit]).trim() !== "") {
      return row[hit];
    }
  }
  return "";
}

export function loadOpenStoreCandidateMatches(xlsxPath: string): {
  rows: P243OsbpqSheetRow[];
  sheetName: string;
  notes: string[];
} {
  const notes: string[] = [];
  const workbook = XLSX.readFile(xlsxPath);
  const sheetName =
    workbook.SheetNames.find((n) => /match/i.test(n)) ?? workbook.SheetNames[0] ?? "Matches";
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Workbook has no sheet "${sheetName}"`);
  }
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  notes.push(`Loaded ${raw.length} row(s) from sheet "${sheetName}" in ${xlsxPath}`);

  const rows: P243OsbpqSheetRow[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const r = raw[i]!;
    const candidateName = cellString(pickColumn(r, ["Candidate", "Name", "Candidate Name"]));
    if (!candidateName) continue;

    const position = cellString(pickColumn(r, ["Position", "Job", "Job Title"]));
    const fromPosition = parseCityStateFromPosition(position);
    const candidateCity = normalizeCity(
      cellString(pickColumn(r, ["Candidate City", "Home City", "City"])),
    );
    const candidateState = normalizeState(
      cellString(pickColumn(r, ["State", "Candidate State", "Home State"])),
    );
    const storeCity = fromPosition.city || candidateCity;
    const storeState = fromPosition.state || candidateState;
    const storeNumber = cellString(
      pickColumn(r, ["Store Number", "Store #", "Store No", "StoreNo"]),
    );
    const matchingOpenStore = cellString(
      pickColumn(r, ["Matching Open Store", "Open Store", "Store", "Store Name"]),
    );
    const project = cellString(pickColumn(r, ["Project", "Project Name"]));
    const cityState =
      cellString(pickColumn(r, ["City/State", "City State", "Location"])) ||
      (storeCity && storeState ? `${storeCity.toUpperCase()}, ${storeState}` : "");

    rows.push({
      rowIndex: i + 2, // 1-indexed excel + header
      candidateName,
      email: normalizeEmail(pickColumn(r, ["Email", "E-mail"])),
      phone: normalizePhone(pickColumn(r, ["Phone", "Mobile", "Phone Number"])),
      position,
      matchingOpenStore,
      storeNumber,
      project,
      cityState,
      storeCity,
      storeState,
      candidateCity,
      candidateState,
      sheetStage: cellString(pickColumn(r, ["Stage", "Status"])),
    });
  }

  notes.push(`Parsed ${rows.length} candidate match row(s).`);
  return { rows, sheetName, notes };
}
