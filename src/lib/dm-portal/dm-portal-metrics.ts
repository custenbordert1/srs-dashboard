import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import {
  buildTerritoryMetricsFromDashboardSnapshot,
  countNeedsAttentionFromAlertSummary,
} from "@/lib/territory-intelligence";

export type DmPortalCardMetrics = {
  openJobs: number;
  applicants: number;
  openCalls: number;
  activeReps: number;
  coveragePercent: number;
  needsAttention: number;
};

/** @deprecated Prefer `TerritoryMetrics` from `@/lib/territory-intelligence`. */
export function buildDmPortalCardMetrics(snapshot: DmDashboardSnapshot): DmPortalCardMetrics {
  const metrics = buildTerritoryMetricsFromDashboardSnapshot(snapshot);
  return {
    openJobs: metrics.openJobs,
    applicants: metrics.applicantsLast7Days,
    openCalls: metrics.openCalls,
    activeReps: metrics.activeReps,
    coveragePercent: metrics.coveragePercent,
    needsAttention: countNeedsAttentionFromAlertSummary(snapshot),
  };
}
