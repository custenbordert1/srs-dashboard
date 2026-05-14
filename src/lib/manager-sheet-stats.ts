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
