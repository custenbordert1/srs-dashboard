import type { Kpi } from "@/lib/recruiting-sample-data";
import type { MelProjectRow, MelProjectsDataResult } from "@/lib/mel-projects-sheet";

const STORE_CALL_ALIASES = ["store call", "storecall"];
const PROJECT_NO_ALIASES = ["project no", "project no.", "project number", "project #"];
const PROJECT_NAME_ALIASES = ["project name"];
const MANAGER_ALIASES = ["manager", "dm", "district manager"];
const STORE_NAME_ALIASES = ["location name", "store name"];
const STATUS_ALIASES = ["status"];
const STATE_ALIASES = ["state/province", "state", "st", "province"];
const STAFF_NAME_ALIASES = ["staff name", "rep name", "rep"];
const STAFF_NUMBER_ALIASES = ["staff number", "rep number", "rep #"];

const COMPLETED_STATUS_VALUES = new Set(["completed", "complete", "done"]);

export const MEL_TABLE_ROW_LIMIT = 25;

export type MelProjectColumnKeys = {
  storeCall?: string;
  projectNo?: string;
  projectName?: string;
  manager?: string;
  storeName?: string;
  status?: string;
  state?: string;
  staffName?: string;
  staffNumber?: string;
  missingColumns: string[];
};

export type MelProjectTableRow = {
  storeCall: string;
  projectNo: string;
  projectName: string;
  manager: string;
  storeName: string;
  status: string;
  state: string;
};

export type MelProjectsKpiSnapshot = {
  activeProjects: number;
  activeReps: number;
  completedPercent: number | null;
  openStoreCalls: number;
  totalStoreCalls: number;
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
    if (aliases.some((alias) => normHeader(h) === normHeader(alias))) return h;
  }
  for (const h of headers) {
    const n = normHeader(h);
    for (const alias of aliases) {
      const a = normHeader(alias);
      if (n.includes(a) || a.includes(n)) return h;
    }
  }
  return undefined;
}

export function resolveMelProjectColumnKeys(headers: string[]): MelProjectColumnKeys {
  const storeCall = pickColumn(headers, STORE_CALL_ALIASES);
  const projectNo = pickColumn(headers, PROJECT_NO_ALIASES);
  const projectName = pickColumn(headers, PROJECT_NAME_ALIASES);
  const manager = pickColumn(headers, MANAGER_ALIASES);
  const storeName = pickColumn(headers, STORE_NAME_ALIASES);
  const status = pickColumn(headers, STATUS_ALIASES);
  const state = pickColumn(headers, STATE_ALIASES);
  const staffName = pickColumn(headers, STAFF_NAME_ALIASES);
  const staffNumber = pickColumn(headers, STAFF_NUMBER_ALIASES);

  const missingColumns: string[] = [];
  if (!storeCall) missingColumns.push("Store Call");
  if (!projectNo) missingColumns.push("Project No");
  if (!projectName) missingColumns.push("Project Name");
  if (!manager) missingColumns.push("Manager");
  if (!storeName) missingColumns.push("Store Name");
  if (!status) missingColumns.push("Status");

  return {
    storeCall,
    projectNo,
    projectName,
    manager,
    storeName,
    status,
    state,
    staffName,
    staffNumber,
    missingColumns,
  };
}

function cell(row: MelProjectRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

export function isCompletedStoreCallStatus(raw: string): boolean {
  return COMPLETED_STATUS_VALUES.has(raw.trim().toLowerCase());
}

function isAssignedRep(staffName: string): boolean {
  const name = staffName.trim().toLowerCase();
  if (!name || name === "open" || name === "—") return false;
  return true;
}

export function buildMelProjectTableRows(
  rows: MelProjectRow[],
  headers: string[],
): { rows: MelProjectTableRow[]; keys: MelProjectColumnKeys } {
  const keys = resolveMelProjectColumnKeys(headers);
  const out: MelProjectTableRow[] = [];

  for (const row of rows) {
    out.push({
      storeCall: cell(row, keys.storeCall) || "—",
      projectNo: cell(row, keys.projectNo) || "—",
      projectName: cell(row, keys.projectName) || "—",
      manager: cell(row, keys.manager) || "—",
      storeName: cell(row, keys.storeName) || "—",
      status: cell(row, keys.status) || "—",
      state: cell(row, keys.state) || "—",
    });
  }

  return { rows: out, keys };
}

export function computeMelProjectsKpiSnapshot(
  rawRows: MelProjectRow[],
  tableRows: MelProjectTableRow[],
  keys: MelProjectColumnKeys,
): MelProjectsKpiSnapshot {
  const totalStoreCalls = tableRows.length;
  let completedCalls = 0;
  let openStoreCalls = 0;
  const activeProjectNos = new Set<string>();
  const activeRepKeys = new Set<string>();

  for (let i = 0; i < tableRows.length; i++) {
    const tableRow = tableRows[i]!;
    const raw = rawRows[i]!;

    const completed = isCompletedStoreCallStatus(tableRow.status);
    if (completed) {
      completedCalls += 1;
    } else {
      openStoreCalls += 1;
      if (tableRow.projectNo !== "—") {
        activeProjectNos.add(tableRow.projectNo);
      }

      const staffName = cell(raw, keys.staffName);
      const staffNumber = cell(raw, keys.staffNumber);
      if (isAssignedRep(staffName)) {
        activeRepKeys.add(staffNumber || staffName);
      }
    }
  }

  const completedPercent =
    totalStoreCalls > 0
      ? Math.round((completedCalls / totalStoreCalls) * 1000) / 10
      : null;

  return {
    activeProjects: activeProjectNos.size,
    activeReps: activeRepKeys.size,
    completedPercent,
    openStoreCalls,
    totalStoreCalls,
    columnHint: "Store calls from MEL projects Google Sheet",
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
    return [
      {
        id: "active-projects",
        label: "Active Projects",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint: sheetError,
      },
      {
        id: "active-reps",
        label: "Active Reps",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint: sheetError,
      },
      {
        id: "completed-pct",
        label: "Completed %",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint: sheetError,
      },
      {
        id: "open-store-calls",
        label: "Open Store Calls",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint: sheetError,
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
      hint: `Unique project numbers with open store calls · ${hint}`,
    },
    {
      id: "active-reps",
      label: "Active Reps",
      value: snapshot.activeReps.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `Assigned reps on open store calls · ${hint}`,
    },
    {
      id: "completed-pct",
      label: "Completed %",
      value: formatPercent(snapshot.completedPercent),
      change: "Live",
      changeDirection: "flat",
      hint: `Completed store calls ÷ ${snapshot.totalStoreCalls.toLocaleString()} total · ${hint}`,
    },
    {
      id: "open-store-calls",
      label: "Open Store Calls",
      value: snapshot.openStoreCalls.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `Non-completed store calls · ${hint}`,
    },
  ];
}

export type MelProjectsViewModel = {
  tableRows: MelProjectTableRow[];
  keys: MelProjectColumnKeys;
  snapshot: MelProjectsKpiSnapshot;
};

export function buildMelProjectsViewModel(
  data: Extract<MelProjectsDataResult, { ok: true }>,
): MelProjectsViewModel {
  const { rows: tableRows, keys } = buildMelProjectTableRows(data.rows, data.headers);
  const snapshot = computeMelProjectsKpiSnapshot(data.rows, tableRows, keys);
  return { tableRows, keys, snapshot };
}
