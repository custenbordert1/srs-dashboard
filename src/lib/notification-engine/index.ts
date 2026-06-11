export {
  applyNotificationOverlays,
  buildGeneratedNotifications,
  buildNotificationCenterSnapshot,
  buildNotificationMetrics,
  filterNotificationsForSession,
  listCriticalNotifications,
  type NotificationBuildContext,
} from "@/lib/notification-engine/build-notifications";
export { buildNotificationSourceKey } from "@/lib/notification-engine/dedupe";
export {
  dispatchNotificationDelivery,
  SUPPORTED_NOTIFICATION_CHANNELS,
  type DeliveryDispatchResult,
} from "@/lib/notification-engine/notification-delivery";
export {
  AUTOMATION_RULES,
  CANDIDATE_AGING_NOTIFICATION_DAYS,
  COVERAGE_RISK_NOTIFICATION_THRESHOLD,
  getAutomationRule,
  OPEN_CALL_INACTIVITY_DAYS,
  PAPERWORK_PENDING_NOTIFICATION_HOURS,
  RECRUITER_WORKLOAD_NOTIFICATION_THRESHOLD,
} from "@/lib/notification-engine/notification-rules";
export {
  listNotificationOverlays,
  markNotificationsRead,
  updateNotificationOverlay,
} from "@/lib/notification-engine/notification-store";
export type {
  AutomationRule,
  NotificationAudience,
  NotificationAuditEntry,
  NotificationCenterSnapshot,
  NotificationChannel,
  NotificationLifecycleStatus,
  NotificationMetrics,
  NotificationRecord,
  NotificationRuleId,
  NotificationSeverity,
  NotificationStoreOverlay,
} from "@/lib/notification-engine/types";
