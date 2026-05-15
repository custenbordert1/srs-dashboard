import type { Kpi } from "@/lib/recruiting-sample-data";

export type KpiDrillFilterId =
  | "open-posts"
  | "critical-posts"
  | "avg-applicants"
  | "zero-applicant-pct";

export const KPI_DRILL_FILTER_LABELS: Record<KpiDrillFilterId, string> = {
  "open-posts": "Open Posts",
  "critical-posts": "Critical Posts",
  "avg-applicants": "Avg Applicants",
  "zero-applicant-pct": "Zero Applicant %",
};

export type AttentionPriority = "Critical" | "High" | "Medium" | "Healthy";

export type NeedsAttentionFilterableRow = {
  priority: AttentionPriority;
  applicantCount: number;
};

export function matchesKpiDrillFilter(
  row: NeedsAttentionFilterableRow,
  filter: KpiDrillFilterId | null,
): boolean {
  if (!filter || filter === "open-posts") return true;
  if (filter === "critical-posts") return row.priority === "Critical";
  if (filter === "avg-applicants") return row.applicantCount >= 1 && row.applicantCount <= 2;
  if (filter === "zero-applicant-pct") return row.applicantCount === 0;
  return true;
}

export function kpiIdToDrillFilter(kpiId: string): KpiDrillFilterId | null {
  if (
    kpiId === "open-posts" ||
    kpiId === "critical-posts" ||
    kpiId === "avg-applicants" ||
    kpiId === "zero-applicant-pct"
  ) {
    return kpiId;
  }
  return null;
}

export function isDrillableManagerKpi(kpi: Kpi): boolean {
  return kpiIdToDrillFilter(kpi.id) !== null;
}
