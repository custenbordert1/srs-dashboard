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
export {
  buildStableRecommendationKey,
  buildStableRecommendationKeyFromRecommendation,
  isLegacyUnstableForecastKey,
  resolveActionForecastKey,
  slugPart,
} from "@/lib/executive-accountability/stable-recommendation-key";
export type { StableRecommendationKeyInput } from "@/lib/executive-accountability/stable-recommendation-key";
export type { ExecutiveOperatingRhythm } from "@/lib/executive-accountability/operating-rhythm-types";
export { buildAuditCenterRows, filterAuditCenterRows, uniqueAuditOwners } from "@/lib/executive-accountability/audit-center";
export type { AuditCenterFilters, AuditCenterRow } from "@/lib/executive-accountability/audit-center";
export { detectForecastChanges } from "@/lib/executive-accountability/forecast-changes";
export type { ForecastChangeLine, ForecastChangesSummary } from "@/lib/executive-accountability/forecast-changes";
export { formatExecutiveEmailMarkdown } from "@/lib/executive-accountability/executive-email-export";
export {
  buildOverdueEscalationDashboard,
  daysOverdue,
  overdueEscalationBucket,
} from "@/lib/executive-accountability/overdue-escalation";
export type {
  OverdueEscalationBucket,
  OverdueEscalationDashboard,
  OverdueEscalationRow,
} from "@/lib/executive-accountability/overdue-escalation";
export { buildExecutiveWeeklyPacket } from "@/lib/executive-accountability/weekly-executive-packet";
export { buildWeeklyExecutiveNarrative } from "@/lib/executive-accountability/weekly-narrative";
export { buildExecutiveWeeklySummary, startOfUtcWeek } from "@/lib/executive-accountability/weekly-summary";
export {
  loadExecutiveAccountabilityStore,
  saveExecutiveAccountabilityStore,
  updateExecutiveAction,
} from "@/lib/executive-accountability/recommendation-store";
