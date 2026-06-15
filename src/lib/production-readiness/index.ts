export {
  buildProductionReadinessSnapshot,
  withServerCache,
  SERVER_CACHE_DEFAULT_TTL_MS,
  type ProductionReadinessContext,
} from "@/lib/production-readiness/build-production-readiness-snapshot";
export { buildIntegrationStatusSnapshot } from "@/lib/production-readiness/build-system-status-snapshot";
export { buildDataQualitySnapshot } from "@/lib/production-readiness/build-data-quality-snapshot";
export { buildProductionScorecard } from "@/lib/production-readiness/build-production-scorecard";
export { buildPlatformDiagnosticsReport } from "@/lib/platform-diagnostics/build-platform-diagnostics-report";
export {
  buildUnifiedAuditActivity,
  buildLoginHistory,
  buildDataChangeHistory,
  readSecurityAuditLog,
} from "@/lib/production-readiness/audit-log-reader";
export {
  listUserProfiles,
  createManagedUser,
  updateManagedUser,
  getManagedUserProfile,
} from "@/lib/production-readiness/user-management";
export { buildDeploymentChecklist, buildStartupDiagnostics } from "@/lib/production-readiness/deployment-readiness";
export { buildDemoModeSnapshot, isExecutiveDemoModeEnabled } from "@/lib/production-readiness/demo-mode";
export { PERMISSION_MATRIX, roleHasPermission } from "@/lib/production-readiness/types";
export type {
  ProductionReadinessSnapshot,
  PermissionMatrixEntry,
  PermissionAction,
  UserProfileSummary,
  AuditActivityEntry,
  LoginHistoryEntry,
  DataQualityIssue,
  IntegrationStatus,
  DeploymentChecklistItem,
  DemoModeSnapshot,
} from "@/lib/production-readiness/types";
export type {
  ProductionScorecard,
  ProductionScorecardRow,
  ProductionScorecardDimension,
} from "@/lib/production-readiness/build-production-scorecard";
export type {
  PlatformDiagnosticsReport,
  PlatformPageDiagnostic,
  PlatformPageId,
} from "@/lib/platform-diagnostics/build-platform-diagnostics-report";
