import type { Kpi } from "@/lib/recruiting-sample-data";
import type { SheetRow } from "@/lib/google-sheet-csv";
import { parseApplicantCount } from "@/lib/post-automation";
import {
  isOpenPostStatus,
  parseBreezyLinked,
  resolveKpiSheetColumnKeys,
} from "@/lib/sheet-kpi-metrics";

export type ManagerSheetStats = {
  managerName: string;
  totalOpenPosts: number;
  zeroApplicantPosts: number;
  totalApplicants: number;
  breezyLinkedPercent: number | null;
  breezyLinkedCount: number;
};

function cell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

/** Stats for one manager: open posts = Status Open or Requested (same as KPI cards). */
export function computeManagerSheetStats(
  rows: SheetRow[],
  headers: string[],
  managerName: string,
): ManagerSheetStats | null {
  const name = managerName.trim();
  if (!name) return null;

  const keys = resolveKpiSheetColumnKeys(headers);
  if (!keys.manager || !keys.status || !keys.applicantCount) {
    return {
      managerName: name,
      totalOpenPosts: 0,
      zeroApplicantPosts: 0,
      totalApplicants: 0,
      breezyLinkedPercent: null,
      breezyLinkedCount: 0,
    };
  }

  let totalOpenPosts = 0;
  let zeroApplicantPosts = 0;
  let totalApplicants = 0;
  let breezyLinkedCount = 0;

  for (const row of rows) {
    if (cell(row, keys.manager) !== name) continue;
    const statusRaw = cell(row, keys.status);
    if (!isOpenPostStatus(statusRaw)) continue;

    totalOpenPosts += 1;
    const ac = parseApplicantCount(cell(row, keys.applicantCount));
    totalApplicants += ac;
    if (ac === 0) zeroApplicantPosts += 1;
    if (keys.breezyLinked && parseBreezyLinked(cell(row, keys.breezyLinked))) {
      breezyLinkedCount += 1;
    }
  }

  const breezyLinkedPercent =
    totalOpenPosts > 0 && keys.breezyLinked
      ? Math.round((breezyLinkedCount / totalOpenPosts) * 1000) / 10
      : null;

  return {
    managerName: name,
    totalOpenPosts,
    zeroApplicantPosts,
    totalApplicants,
    breezyLinkedPercent,
    breezyLinkedCount,
  };
}

export type ManagerKpiSnapshot = {
  openPosts: number;
  criticalPosts: number;
  avgApplicants: number | null;
  zeroApplicantPercent: number | null;
  scopeLabel: string;
  columnHint: string;
};

function isBreezyYes(raw: string): boolean {
  return raw.trim().toLowerCase() === "yes";
}

/** Open-post KPIs for all managers or one manager when `selectedManager` is set. */
export function computeManagerKpiSnapshot(
  rows: SheetRow[],
  headers: string[],
  selectedManager?: string | null,
): ManagerKpiSnapshot {
  const keys = resolveKpiSheetColumnKeys(headers);
  const managerFilter = selectedManager?.trim() || null;
  const canFilterByManager = Boolean(managerFilter && keys.manager);

  if (!keys.status || !keys.applicantCount) {
    const missing =
      keys.missingForKpis.length > 0
        ? `Missing: ${keys.missingForKpis.join(", ")}`
        : "Could not map sheet columns";
    return {
      openPosts: 0,
      criticalPosts: 0,
      avgApplicants: null,
      zeroApplicantPercent: null,
      scopeLabel: managerFilter ?? "All managers",
      columnHint: missing,
    };
  }

  let openPosts = 0;
  let criticalPosts = 0;
  let totalApplicants = 0;
  let zeroApplicantPosts = 0;

  for (const row of rows) {
    if (canFilterByManager && cell(row, keys.manager) !== managerFilter) continue;

    const statusRaw = cell(row, keys.status);
    if (!isOpenPostStatus(statusRaw)) continue;

    openPosts += 1;
    const applicants = parseApplicantCount(cell(row, keys.applicantCount));
    totalApplicants += applicants;
    if (applicants === 0) zeroApplicantPosts += 1;

    const breezyYes = keys.breezyLinked
      ? isBreezyYes(cell(row, keys.breezyLinked))
      : false;
    if (applicants === 0 && !breezyYes) criticalPosts += 1;
  }

  const avgApplicants = openPosts > 0 ? totalApplicants / openPosts : null;
  const zeroApplicantPercent =
    openPosts > 0 ? Math.round((zeroApplicantPosts / openPosts) * 1000) / 10 : null;

  let scopeLabel = "All managers";
  if (managerFilter) {
    scopeLabel = canFilterByManager ? managerFilter : "All managers";
  }

  let columnHint = "Open + Requested posts from live sheet";
  if (managerFilter && !keys.manager) {
    columnHint += " · Manager column not found; showing overall totals";
  } else if (canFilterByManager) {
    columnHint += ` · ${managerFilter}`;
  }

  return {
    openPosts,
    criticalPosts,
    avgApplicants,
    zeroApplicantPercent,
    scopeLabel,
    columnHint,
  };
}

function formatAvgApplicants(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function managerKpiSnapshotToKpis(
  snapshot: ManagerKpiSnapshot,
  sheetError?: string,
): Kpi[] {
  if (sheetError) {
    const hint = sheetError;
    return [
      {
        id: "open-posts",
        label: "Open Posts",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint,
      },
      {
        id: "critical-posts",
        label: "Critical Posts",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint,
      },
      {
        id: "avg-applicants",
        label: "Avg Applicants",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint,
      },
      {
        id: "zero-applicant-pct",
        label: "Zero Applicant %",
        value: "—",
        change: "—",
        changeDirection: "flat",
        hint,
      },
    ];
  }

  const scopeHint = `${snapshot.scopeLabel} · ${snapshot.columnHint}`;
  const zeroPctValue =
    snapshot.zeroApplicantPercent === null ? "—" : `${snapshot.zeroApplicantPercent}%`;

  return [
    {
      id: "open-posts",
      label: "Open Posts",
      value: snapshot.openPosts.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: scopeHint,
    },
    {
      id: "critical-posts",
      label: "Critical Posts",
      value: snapshot.criticalPosts.toLocaleString(),
      change: "Live",
      changeDirection: "flat",
      hint: `0 applicants and Breezy not linked · ${scopeHint}`,
    },
    {
      id: "avg-applicants",
      label: "Avg Applicants",
      value: formatAvgApplicants(snapshot.avgApplicants),
      change: "Live",
      changeDirection: "flat",
      hint: `Mean applicants per open post · ${scopeHint}`,
    },
    {
      id: "zero-applicant-pct",
      label: "Zero Applicant %",
      value: zeroPctValue,
      change: "Live",
      changeDirection: "flat",
      hint: `Share of open posts with 0 applicants · ${scopeHint}`,
    },
  ];
}
