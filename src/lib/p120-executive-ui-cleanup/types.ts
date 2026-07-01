import type { RecoveryActionQueueItem } from "@/lib/p119-autonomous-recovery-engine/types";

export const P120_SOURCE_PHASE = "P120";
export const P120_DEFAULT_MODE = "dryRun" as const;

export const P120_REMOVED_PANELS = [
  "ExecutivePaperworkDashboardPanel",
  "PaperworkUnlockQueuePanel",
  "BreezyJobPublishReviewPanel",
] as const;

export const P120_COLLAPSED_SECTIONS = [
  "detailed_recovery_categories",
  "raw_blocker_breakdown",
  "long_audit_details",
  "historical_artifacts",
  "verbose_diagnostics",
  "advanced_paperwork_panels",
] as const;

export const P120_VISIBLE_SECTIONS = [
  "executive_command_summary",
  "top_5_actions",
  "operations_health",
  "autonomous_recovery_center",
] as const;

export type ExecutiveGoStatus = "GO" | "GO WITH CONDITIONS" | "NO-GO";

export type AutomationLiveStatus = "LIVE" | "NOT LIVE";
export type SendsEnabledStatus = "SENDS ENABLED" | "SENDS DISABLED";

export type EnrichedTopAction = RecoveryActionQueueItem & {
  title: string;
  recommendedOwner: string;
  safetyStatus: string;
  humanApprovalRequired: boolean;
};

export type ExecutiveCommandSummaryMetrics = {
  automationLive: AutomationLiveStatus;
  paperworkSendingAutomatically: SendsEnabledStatus;
  goStatus: ExecutiveGoStatus;
  totalBlockedCandidates: number;
  estimatedRecoverableCandidates: number;
  approvedMappingsReady: number;
  pendingMappingReviews: number;
  topRecommendedAction: string;
  humanApprovalRequired: boolean;
};

export type ExecutiveUiCleanupReport = {
  sourcePhase: typeof P120_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P120_DEFAULT_MODE;
  summary: string;
  duplicatePanelsRemoved: readonly string[];
  sectionsCollapsed: readonly string[];
  sectionsVisibleByDefault: readonly string[];
  summaryMetrics: ExecutiveCommandSummaryMetrics;
  top5Actions: EnrichedTopAction[];
  safetyConfirmation: {
    noSends: boolean;
    noBreezyWrites: boolean;
    noLiveMode: boolean;
    noRunnerWiring: boolean;
    uiCleanupOnly: boolean;
  };
  warnings: string[];
};
