import type { Kpi } from "@/lib/recruiting-sample-data";
import type { MelProjectRow, MelProjectsDataResult } from "@/lib/mel-projects-sheet";

const PROJECT_NAME_ALIASES = ["project name", "project", "name", "title"];
const DM_ALIASES = ["dm", "district manager", "hiring manager", "manager"];
const REP_COUNT_ALIASES = ["rep count", "reps", "# reps", "rep_count", "reps count"];
const STATUS_ALIASES = ["status", "project status"];
const COMPLETION_ALIASES = [
  "completion %",
  "completion",
  "complete %",
  "completion percent",
  "% complete",
  "percent complete",
];
const OPEN_CALLS_ALIASES = [
  "open calls",
  "open store calls",
  "store calls",
  "open call",
  "# open calls",
];
const STATE_ALIASES = ["state", "st"];

const INACTIVE_STATUS_VALUES = new Set([
  "complete",
  "completed",
  "done",
  "closed",
  "cancelled",
  "canceled",
  "inactive",
]);

export type MelProjectColumnKeys = {
  projectName?: string;
  dm?: string;
  repCount?: string;
  status?: string;
  completionPercent?: string;
  openCalls?: string;
  state?: string;
  missingColumns: string[];
};

export type MelProjectTableRow = {
  projectName: string;
  dm: string;
  repCount: number;
  status: string;
  completionPercent: number | null;
  openCalls: number;
  state: string;
};

export type MelProjectsKpiSnapshot = {
  activeProjects: number;
  activeReps: number;
  completedPercent: number | null;
  openStoreCalls: number;
  columnHint: string;
};

function normHeader(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function pickColumn(headers: string[], aliases: string[]): string | undefined {
  const set = new Map<string, string>();
  for (const h of headers) {
    set.set(normHeader(h), h);
  }
  for (const alias of aliases) {
    const direct = set.get(normHeader(alias));
    if (direct) return direct;
  }
  for (const h of headers) {
    const n = normHeader(h);
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (n === a || n.includes(a) || a.includes(n)) return h;
    }
  }
  return undefined;
}

export function resolveMelProjectColumnKeys(headers: string[]): MelProjectColumnKeys {
  const projectName = pickColumn(headers, PROJECT_NAME_ALIASES);
  const dm = pickColumn(headers, DM_ALIASES);
  const repCount = pickColumn(headers, REP_COUNT_ALIASES);
  const status = pickColumn(headers, STATUS_ALIASES);
  const completionPercent = pickColumn(headers, COMPLETION_ALIASES);
  const openCalls = pickColumn(headers, OPEN_CALLS_ALIASES);
  const state = pickColumn(headers, STATE_ALIASES);

  const missingColumns: string[] = [];
  if (!projectName) missingColumns.push("Project Name");
  if (!dm) missingColumns.push("DM");
  if (!repCount) missingColumns.push("Rep Count");
  if (!status) missingColumns.push("Status");
  if (!completionPercent) missingColumns.push("Completion %");
  if (!openCalls) missingColumns.push("Open Calls");

  return {
    projectName,
    dm,
    repCount,
    status,
    completionPercent,
    openCalls,
    state,
    missingColumns,
  };
}

function cell(row: MelProjectRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

export function parseNumericValue(raw: string): number {
  const cleaned = String(raw).replace(/,/g, "").replace(/%/g, "").trim();
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) && !Number.isNaN(n) ? n : 0;
}

export function parseCompletionPercent(raw: string): number | null {
  const s = String(raw).trim();
  if (!s) return null;
  const hasPercent = s.includes("%");
  const n = parseNumericValue(s);
  if (!Number.isFinite(n)) return null;
  if (!hasPercent && n >= 0 && n <= 1) return Math.round(n * 1000) / 10;
  return Math.round(n * 10) / 10;
}

export function isActiveProjectStatus(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return false;
  return !INACTIVE_STATUS_VALUES.has(v);
}

export function buildMelProjectTableRows(
  rows: MelProjectRow[],
  headers: string[],
): { rows: MelProjectTableRow[]; keys: MelProjectColumnKeys } {
  const keys = resolveMelProjectColumnKeys(headers);
  const out: MelProjectTableRow[] = [];

  for (const row of rows) {
    out.push({
      projectName: cell(row, keys.projectName) || "—",
      dm: cell(row, keys.dm) || "—",
      repCount: parseNumericValue(cell(row, keys.repCount)),
      status: cell(row, keys.status) || "—",
      completionPercent: keys.completionPercent
        ? parseCompletionPercent(cell(row, keys.completionPercent))
        : null,
      openCalls: parseNumericValue(cell(row, keys.openCalls)),
      state: cell(row, keys.state) || "—",
    });
  }

  return { rows: out, keys };
}

export function computeMelProjectsKpiSnapshot(
  tableRows: MelProjectTableRow[],
  keys: MelProjectColumnKeys,
): MelProjectsKpiSnapshot {
  let activeProjects = 0;
  let activeReps = 0;
  let openStoreCalls = 0;
  let completionSum = 0;
  let completionCount = 0;

  for (const row of tableRows) {
    const active = isActiveProjectStatus(row.status);
    if (active) {
      activeProjects += 1;
      activeReps += row.repCount;
      openStoreCalls += row.openCalls;
    }
    if (row.completionPercent !== null) {
      completionSum += row.completionPercent;
      completionCount += 1;
    }
  }

  const completedPercent =
    completionCount > 0 ? Math.round((completionSum / completionCount) * 10) / 10 : null;

  const optionalMissing: string[] = [];
  if (!keys.state) optionalMissing.push("State");

  const columnHint =
    optionalMissing.length > 0
      ? `Mapped from MEL projects sheet · optional: ${optionalMissing.join(", ")}`
      : "Mapped from MEL projects Google Sheet";

  return {
    activeProjects,
    activeReps,
    completedPercent,
    openStoreCalls,
    columnHint,
  };
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value}%`;
}

export function melProjectsSnapshotToKpis(
  snapshot: MelProjectsKpiSnapshot,
  sheetError?: string,
): Kpi[] {
  if (sheetError) {
    const hint = sheetError;
    return [
      {
        id: "active-projects",
        label: "Active Projects",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint,
      },
      {
        id: "active-reps",
        label: "Active Reps",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint,
      },
      {
        id: "completed-pct",
        label: "Completed %",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint,
      },
      {
        id: "open-store-calls",
        label: "Open Store Calls",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint,
      },
    ];
  }

  const hint = snapshot.columnHint;

  return [
    {
      id: "active-projects",
      label: "Active Projects",
      value: snapshot.activeProjects.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `Non-completed statuses · ${hint}`,
    },
    {
      id: "active-reps",
      label: "Active Reps",
      value: snapshot.activeReps.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `Sum of rep count on active projects · ${hint}`,
    },
    {
      id: "completed-pct",
      label: "Completed %",
      value: formatPercent(snapshot.completedPercent),
      change: "Live",
      changeDirection: "flat",
      hint: `Average completion across all projects · ${hint}`,
    },
    {
      id: "open-store-calls",
      label: "Open Store Calls",
      value: snapshot.openStoreCalls.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `Sum of open calls on active projects · ${hint}`,
    },
  ];
}

export function formatCompletionDisplay(value: number | null): string {
  if (value === null) return "—";
  return `${value}%`;
}

export type MelProjectsViewModel = {
  tableRows: MelProjectTableRow[];
  keys: MelProjectColumnKeys;
  snapshot: MelProjectsKpiSnapshot;
};

export function buildMelProjectsViewModel(data: Extract<MelProjectsDataResult, { ok: true }>): MelProjectsViewModel {
  const { rows: tableRows, keys } = buildMelProjectTableRows(data.rows, data.headers);
  const snapshot = computeMelProjectsKpiSnapshot(tableRows, keys);
  return { tableRows, keys, snapshot };
}
