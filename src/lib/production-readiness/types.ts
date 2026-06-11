import type { UserRole } from "@/lib/auth/types";

export type PermissionAction =
  | "view_dashboard"
  | "manage_users"
  | "view_audit_log"
  | "execute_ai_actions"
  | "manage_jobs"
  | "manage_workflows"
  | "view_executive"
  | "manage_escalations"
  | "system_admin";

export type PermissionMatrixEntry = {
  role: UserRole;
  label: string;
  permissions: PermissionAction[];
  description: string;
};

export const PERMISSION_MATRIX: PermissionMatrixEntry[] = [
  {
    role: "admin",
    label: "Admin",
    description: "Full platform access including user and system administration.",
    permissions: [
      "view_dashboard",
      "manage_users",
      "view_audit_log",
      "execute_ai_actions",
      "manage_jobs",
      "manage_workflows",
      "view_executive",
      "manage_escalations",
      "system_admin",
    ],
  },
  {
    role: "executive",
    label: "Executive",
    description: "Leadership dashboards, audit visibility, and AI action execution.",
    permissions: [
      "view_dashboard",
      "view_audit_log",
      "execute_ai_actions",
      "view_executive",
      "manage_escalations",
      "system_admin",
    ],
  },
  {
    role: "recruiter",
    label: "Recruiter",
    description: "Recruiting operations, candidates, jobs, and productivity tools.",
    permissions: [
      "view_dashboard",
      "execute_ai_actions",
      "manage_jobs",
      "manage_workflows",
    ],
  },
  {
    role: "dm",
    label: "District Manager",
    description: "Territory-scoped portal, escalations, and coverage visibility.",
    permissions: ["view_dashboard", "manage_escalations"],
  },
];

export function roleHasPermission(role: UserRole, action: PermissionAction): boolean {
  const entry = PERMISSION_MATRIX.find((row) => row.role === role);
  return entry?.permissions.includes(action) ?? false;
}

export type UserProfileSummary = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  dmName?: string;
  territoryStates: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuditActivityEntry = {
  id: string;
  timestamp: string;
  userId: string;
  role: string;
  action: string;
  entityType: string;
  entityId: string;
  territory: string;
  summary: string;
  source: "security-audit" | "ai-action" | "login";
};

export type LoginHistoryEntry = {
  timestamp: string;
  userId: string;
  role: string;
  outcome: "success" | "failure";
  summary: string;
};

export type DataChangeEntry = {
  timestamp: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
};

export type IntegrationStatus = {
  id: string;
  label: string;
  status: "healthy" | "degraded" | "offline" | "unknown";
  detail: string;
  lastCheckedAt: string;
};

export type DataQualityIssue = {
  id: string;
  category:
    | "territory-mapping"
    | "duplicate-candidate"
    | "invalid-assignment"
    | "stale-opportunity"
    | "sync-failure";
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  count: number;
};

export type PerformanceMetrics = {
  serverCacheEntries: number;
  serverCacheHitRate: number;
  recommendedClientCacheTtlMs: number;
  lazyLoadedTabs: number;
  backgroundRefreshEnabled: boolean;
};

export type ErrorHealthSummary = {
  recentApiFailures: number;
  retryFrameworkEnabled: boolean;
  globalErrorTracking: boolean;
  lastHealthCheckAt: string;
};

export type DeploymentChecklistItem = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type DemoModeSnapshot = {
  enabled: boolean;
  label: string;
  sections: Array<{ id: string; title: string; description: string }>;
};

export type ProductionReadinessSnapshot = {
  fetchedAt: string;
  permissionMatrix: PermissionMatrixEntry[];
  users: UserProfileSummary[];
  auditActivity: AuditActivityEntry[];
  loginHistory: LoginHistoryEntry[];
  dataChanges: DataChangeEntry[];
  integrationStatus: IntegrationStatus[];
  dataQuality: DataQualityIssue[];
  performance: PerformanceMetrics;
  errorHealth: ErrorHealthSummary;
  deploymentChecklist: DeploymentChecklistItem[];
  demoMode: DemoModeSnapshot;
  startupDiagnostics: {
    envOk: boolean;
    authConfigured: boolean;
    demoMode: boolean;
    nodeEnv: string;
  };
};
