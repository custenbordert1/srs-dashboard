import type { AutonomousPaperworkRunnerState } from "@/lib/autonomous-paperwork-runner/types";
import type { AutonomousPaperworkReport } from "@/lib/p106-autonomous-paperwork-engine/types";
import { isApprovedMappingBridgeDryRunEnabled } from "@/lib/p117-approved-mapping-runner-integration/bridge-flag";
import type { RunnerProductionConfig } from "@/lib/autonomous-paperwork-runner/runner-config";
import type { LiveSendOperatorChecklistReport } from "@/lib/live-send-operator-checklist/types";
import type { PaperworkMonitorState } from "@/lib/paperwork-monitor/types";
import type {
  OperationsAlert,
  QueueDepth,
  RunnerHealthSummary,
} from "@/lib/p118-autonomous-paperwork-operations-center/types";
import { resolveRunnerOperationalMode } from "@/lib/p118-autonomous-paperwork-operations-center/resolve-runner-operational-mode";

export type LastRunnerAuditEntry = {
  success?: boolean;
  error?: string | null;
  metrics?: {
    blocked?: number;
    breezySyncOk?: boolean;
  };
  candidateCount?: number;
  sendsThisRun?: number;
};

const NO_RUN_THRESHOLD_MS = 30 * 60 * 1000;
const BLOCKED_SPIKE_THRESHOLD = 50;
const DUPLICATE_SPIKE_THRESHOLD = 10;
const PENDING_REVIEW_BACKLOG_THRESHOLD = 25;

export function buildRunnerHealthSummary(input: {
  config: RunnerProductionConfig;
  state: AutonomousPaperworkRunnerState;
  paperworkReport: AutonomousPaperworkReport;
  lastAudit: LastRunnerAuditEntry | null;
}): RunnerHealthSummary {
  const m = input.paperworkReport.metrics;
  const lastRunResult =
    input.state.lastRunAt == null
      ? "never_run"
      : input.state.lastError
        ? "failed"
        : "success";

  return {
    currentMode: resolveRunnerOperationalMode({
      config: input.config,
      state: input.state,
    }),
    runnerScheduleEnabled: input.config.scheduleEnabled || input.state.scheduleEnabled,
    approvedBridgeDryRunFlag: isApprovedMappingBridgeDryRunEnabled(),
    lastRunAt: input.state.lastRunAt,
    lastRunDurationMs: input.state.lastRunDurationMs,
    lastRunResult,
    lastRunError: input.state.lastError,
    candidatesEvaluated: m.candidatesEvaluated,
    readyToSend: m.readyToSend,
    sentCount: m.sent,
    skippedCount: m.skippedAlreadySent,
    blockedCount: m.candidatesEvaluated - m.readyToSend - m.sent,
    errorsCount: input.state.lastError ? 1 : 0,
  };
}

export function buildOperationsAlerts(input: {
  config: RunnerProductionConfig;
  state: AutonomousPaperworkRunnerState;
  queueDepth: QueueDepth;
  operatorChecklist: LiveSendOperatorChecklistReport;
  monitorState: PaperworkMonitorState | null;
  approvedMappingsCount: number;
  bridgeFlagEnabled: boolean;
  auditLogPresent: boolean;
  lastAudit: LastRunnerAuditEntry | null;
}): OperationsAlert[] {
  const alerts: OperationsAlert[] = [];
  const now = Date.now();
  const lastRunMs = Date.parse(input.state.lastRunAt ?? "");
  const noRun =
    !input.state.lastRunAt ||
    (Number.isFinite(lastRunMs) && now - lastRunMs > NO_RUN_THRESHOLD_MS);

  alerts.push({
    type: "runner_failed",
    severity: "critical",
    reason: input.state.lastError ?? "No runner failure recorded.",
    recommendedAction: "Inspect runner audit log and rerun dry-run cycle.",
    affectedCount: input.state.lastError ? 1 : 0,
    source: "p1061-runner-state",
    active: Boolean(input.state.lastError),
  });

  alerts.push({
    type: "no_run_detected",
    severity: input.config.scheduleEnabled ? "warning" : "info",
    reason: noRun
      ? "No recent runner cycle detected within expected interval."
      : "Runner cycle detected recently.",
    recommendedAction: input.config.scheduleEnabled
      ? "Verify AUTONOMOUS_PAPERWORK_RUNNER_SCHEDULE_ENABLED and runner process."
      : "Start scheduled runner or run manual dry-run cycle.",
    affectedCount: noRun ? 1 : 0,
    source: "p1061-runner-state",
    active: noRun && input.config.scheduleEnabled,
  });

  const liveWithoutGo =
    input.config.liveEngineMode != null && input.operatorChecklist.goNoGo !== "GO";
  alerts.push({
    type: "live_flag_enabled_without_operator_go",
    severity: "critical",
    reason: liveWithoutGo
      ? "Live runner flag set but P101 operator checklist is not GO."
      : "Live flag not set or operator checklist is GO.",
    recommendedAction: "Unset AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE until P101 GO.",
    affectedCount: liveWithoutGo ? 1 : 0,
    source: "runner-config+p101",
    active: liveWithoutGo,
  });

  const blockedCount = input.queueDepth.projectNotMappable + input.queueDepth.projectMappingReview;
  alerts.push({
    type: "sudden_spike_blocked",
    severity: "warning",
    reason:
      blockedCount >= BLOCKED_SPIKE_THRESHOLD
        ? `High blocked mapping count (${blockedCount}).`
        : "Blocked mapping count within normal range.",
    recommendedAction: "Review project mapping queue and bulk approval groups.",
    affectedCount: blockedCount,
    source: "p106-report",
    active: blockedCount >= BLOCKED_SPIKE_THRESHOLD,
  });

  const monitorError = input.monitorState?.lastError ?? null;
  alerts.push({
    type: "dropbox_sign_failure",
    severity: "warning",
    reason: monitorError ?? "No Dropbox Sign monitor errors recorded.",
    recommendedAction: "Check P107 paperwork monitor audit and Dropbox API credentials.",
    affectedCount: monitorError ? 1 : 0,
    source: "p107-monitor-state",
    active: Boolean(monitorError),
  });

  const breezySyncFailed = input.lastAudit?.metrics?.breezySyncOk === false;
  alerts.push({
    type: "breezy_sync_failure",
    severity: "warning",
    reason: breezySyncFailed
      ? "Last runner cycle reported Breezy sync failure."
      : "No Breezy sync failure in last audit entry.",
    recommendedAction: "Verify Breezy API connectivity and ingestion sync.",
    affectedCount: breezySyncFailed ? 1 : 0,
    source: "p1061-runner-audit",
    active: breezySyncFailed,
  });

  alerts.push({
    type: "duplicate_risk_spike",
    severity: "warning",
    reason:
      input.queueDepth.duplicateRisk >= DUPLICATE_SPIKE_THRESHOLD
        ? `${input.queueDepth.duplicateRisk} duplicate_risk blockers.`
        : "Duplicate risk count normal.",
    recommendedAction: "Resolve duplicate-send risks before enabling live sends.",
    affectedCount: input.queueDepth.duplicateRisk,
    source: "p106-report",
    active: input.queueDepth.duplicateRisk >= DUPLICATE_SPIKE_THRESHOLD,
  });

  alerts.push({
    type: "pending_review_backlog",
    severity: "warning",
    reason: `${input.queueDepth.pendingMappingReview} pending mapping review item(s).`,
    recommendedAction: "Work P109/P111 mapping review queue — prioritize SAFE groups.",
    affectedCount: input.queueDepth.pendingMappingReview,
    source: "p109-review-store",
    active: input.queueDepth.pendingMappingReview >= PENDING_REVIEW_BACKLOG_THRESHOLD,
  });

  const bridgeNotUsed =
    input.approvedMappingsCount > 0 && !input.bridgeFlagEnabled;
  alerts.push({
    type: "approved_mapping_not_used",
    severity: "info",
    reason: bridgeNotUsed
      ? `${input.approvedMappingsCount} approved mapping(s) exist but P117 dry-run bridge flag is off.`
      : "Approved mapping bridge flag aligned with approved mappings.",
    recommendedAction:
      "Enable USE_APPROVED_MAPPING_BRIDGE_DRY_RUN=true for dry-run impact validation.",
    affectedCount: bridgeNotUsed ? input.approvedMappingsCount : 0,
    source: "p117-bridge-flag",
    active: bridgeNotUsed,
  });

  alerts.push({
    type: "audit_log_missing",
    severity: "critical",
    reason: input.auditLogPresent
      ? "P97 audit log present."
      : "P97 audit log missing or empty.",
    recommendedAction: "Complete P97 approval persistence before any live send.",
    affectedCount: input.auditLogPresent ? 0 : 1,
    source: "p97-audit-log",
    active: !input.auditLogPresent,
  });

  return alerts;
}

export function buildRecommendedActions(input: {
  alerts: OperationsAlert[];
  safetyStatus: Array<{ id: string; passed: boolean; label: string }>;
  healthSummary: RunnerHealthSummary;
}): string[] {
  const actions: string[] = [];

  for (const alert of input.alerts.filter((entry) => entry.active)) {
    actions.push(`[${alert.severity}] ${alert.type}: ${alert.recommendedAction}`);
  }

  for (const gate of input.safetyStatus.filter((entry) => !entry.passed)) {
    actions.push(`Safety gate failed — ${gate.label}.`);
  }

  if (input.healthSummary.currentMode === "live") {
    actions.push("Live runner mode detected — verify P101 GO and P100 locks before any send.");
  }

  if (input.healthSummary.approvedBridgeDryRunFlag) {
    actions.push("P117 bridge dry-run active — compare baseline vs bridged reports.");
  } else if (input.healthSummary.currentMode === "dryRun") {
    actions.push("Keep runner in dryRun; enable P117 bridge flag to validate approved mapping impact.");
  }

  if (actions.length === 0) {
    actions.push(
      "System monitoring healthy — continue dry-run cycles and mapping review before live operation.",
    );
  }

  return [...new Set(actions)];
}

export function buildLastRunSummary(input: {
  healthSummary: RunnerHealthSummary;
  lastAudit: LastRunnerAuditEntry | null;
}): string | null {
  if (input.healthSummary.lastRunAt == null) {
    return null;
  }

  const auditSends = input.lastAudit?.sendsThisRun ?? 0;
  return [
    `Last run ${input.healthSummary.lastRunResult} at ${input.healthSummary.lastRunAt}.`,
    `Duration ${input.healthSummary.lastRunDurationMs ?? "—"}ms.`,
    `Evaluated ${input.healthSummary.candidatesEvaluated}; ready ${input.healthSummary.readyToSend};`,
    `sent ${input.healthSummary.sentCount}; blocked ${input.healthSummary.blockedCount}.`,
    auditSends > 0 ? `WARNING: ${auditSends} send(s) in last audit entry.` : "No sends in last audit entry.",
  ].join(" ");
}
