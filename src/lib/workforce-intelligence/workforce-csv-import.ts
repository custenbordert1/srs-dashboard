import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import {
  classifyWorkforceRosterClass,
  splitWorkforceReps,
  type WorkforceImportSummary,
} from "@/lib/workforce-intelligence/workforce-roster";
import {
  WORKFORCE_CSV_HEADERS,
  WORKFORCE_CSV_HEADER_SET,
} from "@/lib/workforce-intelligence/workforce-csv-schema";

export type WorkforceImportRowError = { row: number; message: string };

export type WorkforceCsvPreviewRow = Record<string, string>;

export type WorkforceImportPreview = {
  ok: boolean;
  errors: WorkforceImportRowError[];
  previewRows: WorkforceCsvPreviewRow[];
  stats: WorkforceImportStats;
  reps: ActiveRep[];
};

export type WorkforceImportStats = {
  totalReps: number;
  activeCount: number;
  inactiveCount: number;
  terminatedCount: number;
  statesCovered: number;
  uniqueSkillSets: number;
  recentLoginCount: number;
  stateBreakdown: Array<{ state: string; count: number }>;
  skillBreakdown: Array<{ skill: string; count: number }>;
  importSummary?: WorkforceImportSummary;
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

function sanitizeCell(value: string): string {
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim().slice(0, 500);
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function validateHeaders(headers: string[]): string | null {
  const normalized = headers.map(normalizeHeader);
  const unexpected = normalized.filter((h) => h && !WORKFORCE_CSV_HEADER_SET.has(h));
  if (unexpected.length > 0) {
    return `Unexpected columns: ${unexpected.join(", ")}`;
  }
  const missing = WORKFORCE_CSV_HEADERS.filter(
    (required) => !normalized.includes(required.toLowerCase()),
  );
  if (missing.length > 0) {
    return `Missing required columns: ${missing.join(", ")}`;
  }
  return null;
}

function parseSkills(raw: string): string[] {
  if (!raw.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;|]/)
        .map((s) => sanitizeCell(s).toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function parseLoginDate(raw: string): string | null {
  const trimmed = sanitizeCell(raw);
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const now = Date.now();
  return Math.max(0, Math.round((now - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function repDisplayName(srsId: string, city: string): string {
  if (srsId) return `Rep ${srsId}`;
  return city ? `Rep · ${city}` : "Unknown rep";
}

export function buildWorkforceImportStats(reps: ActiveRep[]): WorkforceImportStats {
  const split = splitWorkforceReps(reps);
  const activeRoster = split.active;
  const states = new Set<string>();
  const skills = new Set<string>();
  let recentLoginCount = 0;

  const stateMap = new Map<string, number>();
  const skillMap = new Map<string, number>();

  for (const rep of activeRoster) {
    if (rep.state) {
      states.add(rep.state);
      stateMap.set(rep.state, (stateMap.get(rep.state) ?? 0) + 1);
    }

    const loginDays = rep.lastLoginDaysAgo;
    if (loginDays != null && loginDays <= 14) recentLoginCount += 1;

    for (const skill of rep.skills) {
      skills.add(skill);
      skillMap.set(skill, (skillMap.get(skill) ?? 0) + 1);
    }
  }

  return {
    totalReps: activeRoster.length,
    activeCount: split.active.length,
    inactiveCount: split.inactive.length,
    terminatedCount: split.terminated.length,
    statesCovered: states.size,
    uniqueSkillSets: skills.size,
    recentLoginCount,
    stateBreakdown: [...stateMap.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),
    skillBreakdown: [...skillMap.entries()]
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    importSummary: {
      totalRowsParsed: reps.length,
      activeImported: split.active.length,
      inactiveArchived: split.inactive.length,
      terminatedArchived: split.terminated.length,
      activeRosterCount: split.active.length,
      inactiveArchiveCount: split.inactive.length,
      terminatedArchiveCount: split.terminated.length,
    },
  };
}

export function parseWorkforceCleanCsv(csv: string): WorkforceImportPreview {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      ok: false,
      errors: [{ row: 0, message: "CSV must include a header row and at least one data row." }],
      previewRows: [],
      stats: buildWorkforceImportStats([]),
      reps: [],
    };
  }

  const headerCells = parseCsvLine(lines[0]!);
  const headerError = validateHeaders(headerCells);
  if (headerError) {
    return {
      ok: false,
      errors: [{ row: 1, message: headerError }],
      previewRows: [],
      stats: buildWorkforceImportStats([]),
      reps: [],
    };
  }

  const headerIndex = new Map<string, number>();
  headerCells.forEach((h, i) => headerIndex.set(normalizeHeader(h), i));

  const get = (cells: string[], canonical: string) => {
    const idx = headerIndex.get(canonical.toLowerCase());
    return idx !== undefined ? sanitizeCell(cells[idx] ?? "") : "";
  };

  const reps: ActiveRep[] = [];
  const errors: WorkforceImportRowError[] = [];
  const previewRows: WorkforceCsvPreviewRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const rowNum = i + 1;
    const cells = parseCsvLine(lines[i]!);

    const row: WorkforceCsvPreviewRow = {};
    for (const h of WORKFORCE_CSV_HEADERS) {
      row[h] = get(cells, h);
    }
    if (previewRows.length < 10) previewRows.push(row);

    const srsId = get(cells, "SRS ID");
    const city = get(cells, "City");
    const state = normalizeStateCode(get(cells, "State"));
    const zip = get(cells, "Zipcode").replace(/\D/g, "").slice(0, 5);
    const status = get(cells, "Status");

    if (!srsId) {
      errors.push({ row: rowNum, message: "SRS ID is required." });
      continue;
    }
    if (!state) {
      errors.push({ row: rowNum, message: "Valid State is required." });
      continue;
    }

    const lastLoginAt = parseLoginDate(get(cells, "Last Login"));
    const lastLoginDaysAgo = daysSince(lastLoginAt);
    const rosterClass = classifyWorkforceRosterClass(status);
    const active = rosterClass === "active";
    const skills = parseSkills(get(cells, "Skill Set"));
    const dateOfHire = get(cells, "Date Of Hire");
    const statusLabel =
      sanitizeCell(status) ||
      (rosterClass === "active" ? "Active" : rosterClass === "terminated" ? "Terminated" : "Inactive");

    reps.push({
      repId: srsId.toLowerCase(),
      srsId,
      name: repDisplayName(srsId, city),
      status: statusLabel,
      city,
      state,
      zip,
      lat: null,
      lng: null,
      active,
      skills,
      travelRadius: 45,
      lastProjectDate: null,
      dateOfHire: dateOfHire || null,
      lastLoginAt,
      lastLoginDaysAgo,
      completionRate: active ? 85 : 60,
      noShowRate: active ? 5 : 15,
      dmOwner: "Workforce import",
      melStatus: active ? "active" : "inactive",
      trainingStatus: active ? "certified" : "needs_training",
      openAssignments: 0,
      completedAssignments: 0,
      source: "workforce_csv",
    });
  }

  const stats = buildWorkforceImportStats(reps);

  return {
    ok: errors.length === 0 && reps.length > 0,
    errors,
    previewRows,
    stats,
    reps,
  };
}
