import type {
  DataTrustLevel,
  ExecutiveRecruitingForecastSnapshot,
  ForecastConfidenceLevel,
  RecommendationPriority,
} from "@/lib/executive-recruiting-forecast";

export type ExecutiveActionStatus =
  | "open"
  | "in_progress"
  | "completed"
  | "dismissed"
  | "archived";

export type OperationalEvidenceKind =
  | "candidate_moved"
  | "job_refreshed"
  | "pay_increased"
  | "territory_escalated";

export type OperationalEvidence = {
  id: string;
  kind: OperationalEvidenceKind;
  label: string;
  recordedAt: string;
  recordedBy: string;
  detail: string | null;
};

export type ExecutiveActionAuditEntry = {
  id: string;
  recommendationId: string;
  changedAt: string;
  changedBy: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
};

export type ExecutiveTrackedAction = {
  recommendationId: string;
  sourcePhase: string;
  sourceModule: string;
  sourceForecastKey: string;
  recommendationKind: string | null;
  title: string;
  priority: RecommendationPriority;
  owner: string | null;
  ownerManuallyAssigned: boolean;
  dueDate: string;
  dueDateManuallySet: boolean;
  status: ExecutiveActionStatus;
  expectedImpact: string;
  outcomeNotes: string | null;
  /** @deprecated Use outcomeNotes — kept for backward compatibility on read. */
  actualOutcome: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
  notes: string[];
  operationalEvidence: OperationalEvidence[];
};

export type ForecastHistoryEntry = {
  id: string;
  capturedAt: string;
  projectedHires30: number;
  projectedHires60: number;
  projectedHires90: number;
  territoriesAtRisk: number;
  activeRepCount: number;
  dataTrust: DataTrustLevel;
  forecastConfidence: ForecastConfidenceLevel;
};

export type ForecastBacktestRow = {
  historyId: string;
  capturedAt: string;
  projectedHires30: number;
  actualActiveRepCount: number | null;
  deltaFromProjection: number | null;
  status: "pending" | "insufficient_history" | "ready";
  message: string;
};

export type ForecastBacktestSummary = {
  status: "not_enough_history" | "pending" | "partial" | "ready";
  message: string;
  rows: ForecastBacktestRow[];
};

export type ExecutiveActionStatusSummary = {
  open: number;
  inProgress: number;
  completed: number;
  dismissed: number;
  archived: number;
  overdue: number;
  stale: number;
  total: number;
  completionRate: number;
};

export type OwnerActionGroup = {
  owner: string;
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  actions: ExecutiveTrackedAction[];
};

export type ExecutiveWeeklySummary = {
  periodStart: string;
  periodEnd: string;
  opened: number;
  completed: number;
  overdue: number;
  archived: number;
  topBlockers: string[];
};

export type WeeklyExecutiveNarrative = {
  headline: string;
  whatChanged: string[];
  topRiskThisWeek: string;
  topActionRequired: string;
  ownersWithOverdueItems: string[];
  completedActions: string[];
  dataTrustLabel: string;
  forecastConfidenceLabel: string;
  generatedAt: string;
};

export type ExecutiveAccountabilitySnapshot = {
  generatedAt: string;
  forecast: ExecutiveRecruitingForecastSnapshot;
  /** All actions — permanent history (open, terminal, archived). */
  actions: ExecutiveTrackedAction[];
  activeActions: ExecutiveTrackedAction[];
  statusSummary: ExecutiveActionStatusSummary;
  overdueActions: ExecutiveTrackedAction[];
  staleActions: ExecutiveTrackedAction[];
  ownerGroups: OwnerActionGroup[];
  weeklyNarrative: WeeklyExecutiveNarrative;
  weeklySummary: ExecutiveWeeklySummary;
  forecastBacktest: ForecastBacktestSummary;
  auditByActionId: Record<string, ExecutiveActionAuditEntry[]>;
};
