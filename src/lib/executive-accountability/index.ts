export type {
  ExecutiveAccountabilitySnapshot,
  ExecutiveActionAuditEntry,
  ExecutiveActionStatus,
  ExecutiveActionStatusSummary,
  ExecutiveTrackedAction,
  ExecutiveWeeklySummary,
  ForecastBacktestRow,
  ForecastBacktestSummary,
  ForecastHistoryEntry,
  OperationalEvidence,
  OperationalEvidenceKind,
  OwnerActionGroup,
  WeeklyExecutiveNarrative,
} from "@/lib/executive-accountability/types";

export { buildExecutiveAccountabilitySnapshot } from "@/lib/executive-accountability/build-snapshot";
export {
  calculateCompletionRate,
  detectOverdueActions,
  detectStaleActions,
  getActiveActions,
  groupActionsByOwner,
  summarizeActionStatus,
} from "@/lib/executive-accountability/accountability-engine";
export {
  appendAuditEntry,
  auditEntriesByActionId,
  auditEntriesForAction,
  createOperationalEvidence,
  evidenceKindForRecommendationKind,
  isActiveExecutiveAction,
  normalizeExecutiveTrackedAction,
  OPERATIONAL_EVIDENCE_LABELS,
} from "@/lib/executive-accountability/action-audit";
export {
  archiveChurnedAction,
  convertForecastRecommendationToAction,
  dueDateForPriority,
  mergeForecastIntoExistingAction,
  syncActionsFromForecastRecommendations,
  ARCHIVE_REASON_FORECAST_CHURN,
  P44_SOURCE_MODULE,
  P44_SOURCE_PHASE,
} from "@/lib/executive-accountability/convert-recommendations";
export {
  appendForecastHistory,
  buildForecastBacktestSummary,
  captureForecastHistoryEntry,
  countActiveReps,
  formatTrustAndConfidenceLabels,
} from "@/lib/executive-accountability/forecast-backtest";
export { buildWeeklyExecutiveNarrative } from "@/lib/executive-accountability/weekly-narrative";
export { buildExecutiveWeeklySummary, startOfUtcWeek } from "@/lib/executive-accountability/weekly-summary";
export {
  loadExecutiveAccountabilityStore,
  saveExecutiveAccountabilityStore,
  updateExecutiveAction,
} from "@/lib/executive-accountability/recommendation-store";
