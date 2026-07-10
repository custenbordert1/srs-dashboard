import { buildAutonomousPaperworkOperationsCenterReport } from "@/lib/p118-autonomous-paperwork-operations-center/build-operations-center-report";
import { buildAutonomousRecoveryReport } from "@/lib/p119-autonomous-recovery-engine/build-recovery-report";
import {
  buildExecutiveCommandSummaryMetrics,
  enrichTopActions,
} from "@/lib/p120-executive-ui-cleanup/build-executive-action-summary";
import {
  P120_COLLAPSED_SECTIONS,
  P120_DEFAULT_MODE,
  P120_REMOVED_PANELS,
  P120_SOURCE_PHASE,
  P120_VISIBLE_SECTIONS,
  type ExecutiveUiCleanupReport,
} from "@/lib/p120-executive-ui-cleanup/types";

export async function buildExecutiveUiCleanupReport(): Promise<ExecutiveUiCleanupReport> {
  const warnings = [
    "P120 — UI cleanup only; no automation behavior changes.",
    "P120 — no paperwork sends.",
    "P120 — no Breezy writes.",
    "P120 — no live mode activation.",
  ];

  const [operations, recovery] = await Promise.all([
    buildAutonomousPaperworkOperationsCenterReport(),
    buildAutonomousRecoveryReport(),
  ]);

  const summaryMetrics = buildExecutiveCommandSummaryMetrics({ operations, recovery });
  const top5Actions = enrichTopActions(recovery.actionQueue, 5);

  const summary = [
    `P120 executive command summary — ${summaryMetrics.goStatus}.`,
    `Automation ${summaryMetrics.automationLive}; sends ${summaryMetrics.paperworkSendingAutomatically}.`,
    `${summaryMetrics.totalBlockedCandidates} blocked; ${summaryMetrics.estimatedRecoverableCandidates} recoverable.`,
    `Top action: ${summaryMetrics.topRecommendedAction}.`,
    `Removed ${P120_REMOVED_PANELS.length} duplicate panels; ${P120_COLLAPSED_SECTIONS.length} section groups collapsed by default.`,
  ].join(" ");

  return {
    sourcePhase: P120_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P120_DEFAULT_MODE,
    summary,
    duplicatePanelsRemoved: P120_REMOVED_PANELS,
    sectionsCollapsed: P120_COLLAPSED_SECTIONS,
    sectionsVisibleByDefault: P120_VISIBLE_SECTIONS,
    summaryMetrics,
    top5Actions,
    safetyConfirmation: {
      noSends: true,
      noBreezyWrites: true,
      noLiveMode: operations.healthSummary.currentMode !== "live",
      noRunnerWiring: true,
      uiCleanupOnly: true,
    },
    warnings,
  };
}
