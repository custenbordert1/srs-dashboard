import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  buildPrioritizedTerritoryAlerts,
  mergeTerritoryAlertSources,
  type DmAlertOperationsSummary,
  type DmPrioritizedAlert,
} from "@/lib/dm-dashboard/dm-alert-priority";
import { buildDmNeedsAttention, type DmAttentionItem } from "@/lib/dm-dashboard/dm-needs-attention";
import { buildTerritoryFillRiskAlerts } from "@/lib/dm-dashboard/fill-risk-alerts";

export type TerritoryAlertPipelineResult = {
  fillRiskAlerts: DmAttentionItem[];
  needsAttentionRaw: DmAttentionItem[];
  mergedAlerts: DmAttentionItem[];
  prioritizedAlerts: DmPrioritizedAlert[];
  alertSummary: DmAlertOperationsSummary;
};

/** Single orchestration path for DM territory alerts (algorithms unchanged). */
export function buildTerritoryAlertPipeline(
  jobs: BreezyJob[],
  candidates: BreezyCandidate[],
  fetchedAt: string,
  options?: { healthScore?: number },
): TerritoryAlertPipelineResult {
  const fillRiskAlerts = buildTerritoryFillRiskAlerts(jobs, candidates, fetchedAt);
  const needsAttentionRaw = buildDmNeedsAttention(jobs, candidates, fetchedAt);
  const mergedAlerts = mergeTerritoryAlertSources(fillRiskAlerts, needsAttentionRaw);
  const { alerts: prioritizedAlerts, summary: alertSummary } = buildPrioritizedTerritoryAlerts(
    mergedAlerts,
    jobs,
    candidates,
    fetchedAt,
    { healthScore: options?.healthScore },
  );

  return {
    fillRiskAlerts,
    needsAttentionRaw,
    mergedAlerts,
    prioritizedAlerts,
    alertSummary,
  };
}

/** Fill-risk KPI count: raw fill-risk generator output only. */
export function countFillRiskAlerts(fillRiskAlerts: DmAttentionItem[]): number {
  return fillRiskAlerts.length;
}

/** Needs-attention display count: prioritized critical + high + medium (excludes low). */
export function countNeedsAttentionAlerts(summary: DmAlertOperationsSummary): number {
  return summary.criticalCount + summary.highCount + summary.mediumCount;
}
