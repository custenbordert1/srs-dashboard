/**
 * DM dashboard module — territory-scoped recruiting intelligence.
 * Composes with candidate-ai-scoring, breezy-api, and future MEL/automation hooks.
 */
export { buildDmDashboardSnapshot, type DmDashboardSnapshot, type DmCandidateSummary } from "@/lib/dm-dashboard/build-dm-dashboard";
export { buildExecutiveDashboard, type ExecutiveDashboardSnapshot, type TerritoryRollupRow } from "@/lib/dm-dashboard/build-executive-dashboard";
export {
  buildDmNeedsAttention,
  buildFillRiskAlerts,
  DEFAULT_DM_ATTENTION_CONFIG,
  type DmAttentionItem,
  type DmAttentionCategory,
} from "@/lib/dm-dashboard/dm-needs-attention";
export {
  buildTerritoryFillRiskAlerts,
  highestFillRiskAlerts,
  type FillRiskCategory,
} from "@/lib/dm-dashboard/fill-risk-alerts";
export { buildTerritoryHealthScore, type TerritoryHealthScore } from "@/lib/dm-dashboard/territory-health-score";
export { buildCoverageIntelligence, type TerritoryCoverageSnapshot } from "@/lib/dm-dashboard/coverage-intelligence";
export { buildCandidatePipeline, recentApplicants, type CandidatePipelineSnapshot } from "@/lib/dm-dashboard/candidate-pipeline";
export { buildTerritoryHeatmapPayload, type TerritoryHeatmapPayload, type TerritoryHeatmapCell } from "@/lib/dm-dashboard/territory-heatmap-prep";
