/**
 * DM dashboard module — territory-scoped recruiting views.
 * Composes with candidate-ai-scoring, breezy-api, and future MEL/automation hooks.
 */
export { buildDmDashboardSnapshot, type DmDashboardSnapshot } from "@/lib/dm-dashboard/build-dm-dashboard";
export {
  buildDmNeedsAttention,
  buildFillRiskAlerts,
  DEFAULT_DM_ATTENTION_CONFIG,
  type DmAttentionItem,
} from "@/lib/dm-dashboard/dm-needs-attention";
