import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

export const REP_IMPORT_TEMPLATE_HEADERS = [
  "rep_id",
  "name",
  "city",
  "state",
  "zip",
  "skills",
  "travel_radius_miles",
  "dm_owner",
  "active",
  "completion_rate",
  "no_show_rate",
] as const;

export const REP_IMPORT_CSV_TEMPLATE = `${REP_IMPORT_TEMPLATE_HEADERS.join(",")}
rep-001,Jane Smith,Dallas,TX,75201,"reset,merchandising",50,Jane DM,true,92,3
rep-002,John Lee,Houston,TX,77002,"grocery,osa",45,John DM,true,88,5
`;

export type RepImportRowError = { row: number; message: string };

export type RepImportResult = {
  ok: boolean;
  reps: ActiveRep[];
  errors: RepImportRowError[];
  importedCount: number;
  skippedCount: number;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseBool(raw: string, fallback = true): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  return v === "true" || v === "yes" || v === "1" || v === "y";
}

function parseSkills(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[|;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function parseRepImportCsv(csv: string): RepImportResult {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    return { ok: false, reps: [], errors: [{ row: 0, message: "CSV must include header and at least one data row." }], importedCount: 0, skippedCount: 0 };
  }

  const header = parseCsvLine(lines[0]!).map((h) => h.toLowerCase());
  const index = (name: string) => header.indexOf(name);

  const required = ["rep_id", "name", "city", "state"];
  const missing = required.filter((col) => index(col) < 0);
  if (missing.length > 0) {
    return {
      ok: false,
      reps: [],
      errors: [{ row: 1, message: `Missing columns: ${missing.join(", ")}` }],
      importedCount: 0,
      skippedCount: 0,
    };
  }

  const reps: ActiveRep[] = [];
  const errors: RepImportRowError[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const rowNum = i + 1;
    const cells = parseCsvLine(lines[i]!);
    const get = (col: string) => {
      const idx = index(col);
      return idx >= 0 ? (cells[idx] ?? "").trim() : "";
    };

    const repId = get("rep_id");
    const name = get("name");
    const city = get("city");
    const state = normalizeStateCode(get("state"));

    if (!repId || !name) {
      errors.push({ row: rowNum, message: "rep_id and name are required." });
      continue;
    }
    if (!state) {
      errors.push({ row: rowNum, message: "Valid state code required." });
      continue;
    }

    const travelRadius = Number.parseInt(get("travel_radius_miles"), 10);
    const completionRate = Number.parseInt(get("completion_rate"), 10);
    const noShowRate = Number.parseInt(get("no_show_rate"), 10);

    const isActive = parseBool(get("active"));
    reps.push({
      repId: repId.toLowerCase(),
      name,
      city,
      state,
      zip: get("zip"),
      lat: null,
      lng: null,
      status: isActive ? "active" : "inactive",
      active: isActive,
      skills: parseSkills(get("skills")),
      travelRadius: Number.isFinite(travelRadius) ? Math.min(120, Math.max(15, travelRadius)) : 45,
      lastProjectDate: null,
      completionRate: Number.isFinite(completionRate) ? Math.min(100, Math.max(0, completionRate)) : 80,
      noShowRate: Number.isFinite(noShowRate) ? Math.min(100, Math.max(0, noShowRate)) : 5,
      dmOwner: get("dm_owner") || "Unassigned",
      melStatus: isActive ? "active" : "inactive",
      trainingStatus: completionRate >= 90 ? "certified" : completionRate >= 75 ? "in_training" : "needs_training",
      openAssignments: 0,
      completedAssignments: 0,
    });
  }

  return {
    ok: errors.length === 0,
    reps,
    errors,
    importedCount: reps.length,
    skippedCount: errors.length,
  };
}
