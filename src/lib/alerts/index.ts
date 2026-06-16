export type {
  AlertAction,
  AlertAutomationKind,
  AlertCategory,
  AlertDestination,
  AlertImpactInputs,
  AlertSeverity,
  AlertSnapshot,
  ExecutiveAlert,
  ExecutiveAlertContext,
  ExecutiveAlertLinkedCandidate,
  ExecutiveAlertLinkedRep,
} from "@/lib/alerts/alert-types";
export {
  CANDIDATE_INTERVIEW_PENDING_DAYS,
  CANDIDATE_READY_MEL_AGING_DAYS,
  PLACEMENT_FUNNEL_DROP_OFF_HIGH_MIN,
  PROJECT_COVERAGE_CRITICAL_MAX,
  PROJECT_COVERAGE_HIGH_MAX,
  RECRUITER_WORKLOAD_CRITICAL_MIN,
  RECRUITER_WORKLOAD_HIGH_MIN,
  TERRITORY_COVERAGE_CRITICAL_MAX,
  TERRITORY_COVERAGE_HIGH_MAX,
  projectCoverageSeverity,
  recruiterWorkloadSeverity,
  severityRank,
  territoryCoverageSeverity,
} from "@/lib/alerts/alert-rules";
export {
  buildPrioritizedAlertSnapshot,
  computeImpactScore,
  sortAlertsByImpact,
} from "@/lib/alerts/alert-prioritizer";
export { buildAlerts, type AlertBuildContext } from "@/lib/alerts/build-alerts";
export { buildAlertSnapshot, type BuildAlertSnapshotInput } from "@/lib/alerts/build-alert-snapshot";
export { enrichExecutiveAlerts, type EnrichExecutiveAlertsInput } from "@/lib/alerts/enrich-executive-alerts";
export {
  DEFAULT_EXECUTIVE_ALERT_FILTERS,
  filterExecutiveAlerts,
  listExecutiveAlertTerritories,
  mergeAlertStatuses,
  type ExecutiveAlertFilterState,
  type ExecutiveAlertWithStatus,
} from "@/lib/alerts/executive-alert-filters";
export { resolveExecutiveAlertDrawer } from "@/lib/alerts/executive-alert-drawer";
export { ACTION_LABELS } from "@/lib/alerts/executive-alert-labels";
export {
  buildPlacementContextFromAlert,
  clearPlacementAlertContext,
  readPlacementAlertContext,
  writePlacementAlertContext,
  type PlacementAlertNavigationContext,
} from "@/lib/alerts/placement-alert-navigation";
export {
  EXECUTIVE_ALERT_STATUS_LABELS,
  FOLLOW_UP_PRIORITY_LABELS,
  DEFAULT_EXECUTIVE_ALERT_STATUS,
  type ExecutiveAlertStatus,
  type ExecutiveAlertStatusOverlay,
  type ExecutiveAlertActionLogEntry,
  type ExecutiveAlertFollowUp,
  type ExecutiveAlertActionKind,
  type FollowUpPriority,
  type FollowUpOwnerKind,
} from "@/lib/alerts/executive-alert-status-types";
export {
  listExecutiveAlertStatusOverlays,
  listExecutiveAlertActionLogs,
  listExecutiveAlertFollowUps,
  upsertExecutiveAlertStatusOverlay,
  saveExecutiveAlertNote,
  upsertExecutiveAlertFollowUp,
  appendExecutiveAlertActionLog,
} from "@/lib/alerts/executive-alert-status-store";
export { buildExecutiveAlertAssigneeOptions, type ExecutiveAlertAssigneeOptions } from "@/lib/alerts/build-executive-alert-assignees";
export {
  buildExecutiveAlertFollowUpQueue,
  isFollowUpOverdue,
  resolveFollowUpStoreLabel,
  formatFollowUpDueLabel,
  followUpOwnerLabel,
  followUpPriorityLabel,
  type ExecutiveAlertFollowUpQueueItem,
} from "@/lib/alerts/executive-alert-follow-up-queue";
