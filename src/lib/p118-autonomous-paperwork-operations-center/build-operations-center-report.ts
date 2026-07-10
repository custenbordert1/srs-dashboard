import { readFile } from "node:fs/promises";
import { buildAutonomousPaperworkReport } from "@/lib/p106-autonomous-paperwork-engine/build-autonomous-paperwork-report";
import { loadRunnerState, runnerAuditPath } from "@/lib/autonomous-paperwork-runner/runner-store";
import { resolveRunnerProductionConfig } from "@/lib/autonomous-paperwork-runner/runner-config";
import { loadP84FeatureFlags } from "@/lib/autonomous-paperwork-send-engine/feature-flags-store";
import { countP97AuditEntries } from "@/lib/controlled-live-send/validate-execution-locks";
import { buildLiveSendOperatorChecklist } from "@/lib/live-send-operator-checklist/build-live-send-operator-checklist";
import { buildReviewWorkflowReport } from "@/lib/p109-project-mapping-review/build-review-workflow-report";
import { loadP109ReviewRecords } from "@/lib/p109-project-mapping-review/review-decision-store";
import { listQualifiedApprovedMappings } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";
import { isApprovedMappingBridgeDryRunEnabled } from "@/lib/p117-approved-mapping-runner-integration/bridge-flag";
import { loadMonitorState } from "@/lib/paperwork-monitor/monitor-store";
import { buildPaperworkMonitorMetrics } from "@/lib/paperwork-monitor/build-paperwork-monitor-report";
import {
  buildLastRunSummary,
  buildOperationsAlerts,
  buildRecommendedActions,
  buildRunnerHealthSummary,
  type LastRunnerAuditEntry,
} from "@/lib/p118-autonomous-paperwork-operations-center/build-operations-alerts";
import { buildQueueDepth } from "@/lib/p118-autonomous-paperwork-operations-center/build-queue-depth";
import { buildPaperworkSafetyStatus } from "@/lib/p118-autonomous-paperwork-operations-center/build-safety-status";
import {
  P118_DEFAULT_MODE,
  P118_SOURCE_PHASE,
  type AutonomousPaperworkOperationsCenterReport,
} from "@/lib/p118-autonomous-paperwork-operations-center/types";

async function loadLastRunnerAuditEntry(): Promise<LastRunnerAuditEntry | null> {
  try {
    const raw = await readFile(runnerAuditPath(), "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]!) as LastRunnerAuditEntry;
  } catch {
    return null;
  }
}

export async function buildAutonomousPaperworkOperationsCenterReport(): Promise<AutonomousPaperworkOperationsCenterReport> {
  const warnings = [
    "P118 — monitoring and visibility only.",
    "P118 — no paperwork sends.",
    "P118 — no Breezy writes.",
    "P118 — no live mode activation.",
  ];

  const [
    runnerState,
    paperworkReport,
    reviewWorkflow,
    p109Records,
    p84Flags,
    operatorChecklist,
    auditLineCount,
    monitorState,
    lastAudit,
    config,
  ] = await Promise.all([
    loadRunnerState(),
    buildAutonomousPaperworkReport({ mode: "dryRun", mtdOnly: false }),
    buildReviewWorkflowReport(),
    loadP109ReviewRecords(),
    loadP84FeatureFlags(),
    buildLiveSendOperatorChecklist({ mtdOnly: false }),
    countP97AuditEntries(),
    loadMonitorState().catch(() => null),
    loadLastRunnerAuditEntry(),
    Promise.resolve(resolveRunnerProductionConfig()),
  ]);

  const approvedMappings = listQualifiedApprovedMappings(p109Records);
  const auditLogPresent = auditLineCount > 0;
  const bridgeFlagEnabled = isApprovedMappingBridgeDryRunEnabled();

  const monitorMetrics =
    monitorState != null
      ? buildPaperworkMonitorMetrics({
          candidates: [],
          state: monitorState,
          syncedThisCycle: 0,
          errorsThisCycle: monitorState.lastError ? 1 : 0,
        })
      : null;

  const queueDepth = buildQueueDepth({
    paperworkReport,
    approvedMappings,
    monitorMetrics,
    pendingMappingReviewCount: reviewWorkflow.metrics.pendingCount,
  });

  const healthSummary = buildRunnerHealthSummary({
    config,
    state: runnerState,
    paperworkReport,
    lastAudit,
  });

  const safetyStatus = buildPaperworkSafetyStatus({
    config,
    p84Flags,
    operatorChecklist,
    auditLogPresent,
  });

  const alerts = buildOperationsAlerts({
    config,
    state: runnerState,
    queueDepth,
    operatorChecklist,
    monitorState,
    approvedMappingsCount: approvedMappings.length,
    bridgeFlagEnabled,
    auditLogPresent,
    lastAudit,
  });

  const recommendedActions = buildRecommendedActions({
    alerts,
    safetyStatus,
    healthSummary,
  });

  const criticalAlerts = alerts.filter((alert) => alert.active && alert.severity === "critical");
  const failedSafetyGates = safetyStatus.filter((gate) => !gate.passed);
  const liveModeUnsafe =
    healthSummary.currentMode === "live" && operatorChecklist.goNoGo !== "GO";
  const liveReadinessGates = safetyStatus.filter((gate) =>
    ["live_mode_disabled", "operator_checklist", "audit_logging", "dropbox_sign_guarded"].includes(
      gate.id,
    ),
  );
  const liveReadinessPassed = liveReadinessGates.every((gate) => gate.passed);

  const goNoGo =
    criticalAlerts.length === 0 && !liveModeUnsafe && liveReadinessPassed ? "GO" : "NO-GO";

  const goNoGoReason =
    goNoGo === "GO"
      ? "Monitoring healthy — dry-run only, safety gates acceptable for live readiness review."
      : [
          criticalAlerts.length > 0
            ? `${criticalAlerts.length} critical alert(s) active.`
            : null,
          liveModeUnsafe ? "Live runner mode without operator GO." : null,
          !liveReadinessPassed
            ? `${liveReadinessGates.filter((gate) => !gate.passed).length} live-readiness gate(s) failed.`
            : null,
          failedSafetyGates.length > 0 && liveReadinessPassed
            ? `${failedSafetyGates.length} informational gate(s) need review.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || "Operations center detected blocking conditions.";

  const summary = [
    `P118 operations center — mode ${healthSummary.currentMode}.`,
    `${healthSummary.candidatesEvaluated} evaluated; ${healthSummary.readyToSend} ready; ${healthSummary.blockedCount} blocked.`,
    `${alerts.filter((alert) => alert.active).length} active alert(s).`,
    `${goNoGo}: ${goNoGoReason}`,
  ].join(" ");

  return {
    sourcePhase: P118_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P118_DEFAULT_MODE,
    summary,
    goNoGo,
    goNoGoReason,
    healthSummary,
    safetyStatus,
    queueDepth,
    alerts,
    recommendedActions,
    lastRunSummary: buildLastRunSummary({ healthSummary, lastAudit }),
    warnings,
  };
}
