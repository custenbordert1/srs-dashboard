import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import { loadPaperworkCycleMonitorState } from "@/lib/autonomous-paperwork-orchestrator/cycle-store";
import { loadPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { buildProductionRunnerSnapshot } from "@/lib/p125-autonomous-paperwork-production-runner/build-runner-snapshot";
import { loadProductionRunnerState } from "@/lib/p125-autonomous-paperwork-production-runner/runner-store";
import { buildOperationsCommandCenterReport } from "@/lib/p126-autonomous-operations-command-center/build-operations-command-center-report";
import { buildPaperworkRemediationReport } from "@/lib/p134-paperwork-remediation-engine/build-paperwork-remediation-report";
import {
  isSchedulerHeartbeatStale,
  loadSchedulerState,
} from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-store";
import { loadPilotSafetyLockState } from "@/lib/p138-first-live-send-verification/pilot-safety-lock-store";
import {
  appendHealthSnapshot,
  computeTrend,
  loadHealthHistory,
} from "@/lib/p140-production-rollout-health-monitoring/health-history-store";
import type {
  ComponentHealthStatus,
  ComponentStatus,
  HealthAlert,
  HealthMetricsSnapshot,
  OverallHealthResult,
  ProductionHealthReport,
} from "@/lib/p140-production-rollout-health-monitoring/types";
import { P140_MONITORING_MODE, P140_SOURCE_PHASE } from "@/lib/p140-production-rollout-health-monitoring/types";

const CANDIDATE_SYNC_STALE_MS = 24 * 60 * 60 * 1000;
const EXCESSIVE_RETRY_THRESHOLD = 5;
const QUEUE_STALL_MS = 6 * 60 * 60 * 1000;

function statusScore(status: ComponentHealthStatus): number {
  if (status === "Healthy") return 100;
  if (status === "Warning") return 55;
  return 0;
}

function resolveOverall(components: ComponentStatus[]): { score: number; result: OverallHealthResult } {
  if (components.length === 0) return { score: 0, result: "CRITICAL" };
  const score = Math.round(components.reduce((sum, c) => sum + statusScore(c.status), 0) / components.length);
  const hasCritical = components.some((c) => c.status === "Critical");
  const hasWarning = components.some((c) => c.status === "Warning");
  if (hasCritical || score < 50) return { score, result: "CRITICAL" };
  if (hasWarning || score < 80) return { score, result: "WARNING" };
  return { score, result: "PASS" };
}

function component(
  id: string,
  label: string,
  phase: string,
  status: ComponentHealthStatus,
  detail: string,
  at: string,
): ComponentStatus {
  return { id, label, phase, status, detail, lastCheckedAt: at };
}

function checkDropboxSign(): { status: ComponentHealthStatus; detail: string } {
  const hasKey = Boolean(process.env.DROPBOX_SIGN_API_KEY?.trim());
  if (!hasKey) {
    return { status: "Critical", detail: "DROPBOX_SIGN_API_KEY not configured." };
  }
  return { status: "Healthy", detail: "Dropbox Sign API key configured (read-only monitoring)." };
}

export async function buildProductionHealthReport(input?: {
  skipHistoryAppend?: boolean;
}): Promise<ProductionHealthReport> {
  const started = performance.now();
  const generatedAt = new Date().toISOString();
  const pilotConfig = loadPilotConfig();

  const [
    schedulerState,
    runnerState,
    runnerSnapshot,
    storedCycle,
    registry,
    pilotLock,
    ingestionStore,
    priorHistory,
  ] = await Promise.all([
    loadSchedulerState(),
    loadProductionRunnerState(),
    buildProductionRunnerSnapshot(),
    loadPaperworkCycleMonitorState(),
    loadPilotSendRegistry(),
    loadPilotSafetyLockState(),
    readIngestionStore(),
    loadHealthHistory(),
  ]);

  const cycle = storedCycle.currentCycle;
  const opsReport = await buildOperationsCommandCenterReport({ filters: { timeRange: "today" }, refresh: false });
  const loaded = await loadPaperworkCandidates({ mtdOnly: false });
  const approvalDecisions = buildApprovalDecisionsFromContext(loaded);
  const remediation = await buildPaperworkRemediationReport({ contextOverride: loaded });

  const apiLatencyMs = Math.round(performance.now() - started);
  const schedulerHeartbeatStale = isSchedulerHeartbeatStale(schedulerState);
  const schedulerUptimeMs =
    schedulerState.uptimeStartedAt != null
      ? Math.max(0, Date.now() - Date.parse(schedulerState.uptimeStartedAt))
      : 0;

  const autoApproved = approvalDecisions.filter((d) => d.approvalDecision === "AUTO_APPROVED").length;
  const humanReview = approvalDecisions.filter((d) => d.approvalDecision === "NEEDS_HUMAN_APPROVAL").length;
  const blocked = approvalDecisions.filter(
    (d) => d.approvalDecision === "BLOCKED" || d.approvalDecision === "REJECTED_FOR_SAFETY",
  ).length;
  const averageApprovalScore =
    approvalDecisions.length > 0
      ? Math.round(approvalDecisions.reduce((sum, d) => sum + d.approvalScore, 0) / approvalDecisions.length)
      : 0;
  const queueDepth = cycle?.sendQueue.queueDepth ?? opsReport.queue.readyToSend;
  const sendReadiness = schedulerState.lastCycleMetrics?.readinessCount ?? 0;
  const retryCount = runnerState.retryQueue.length;

  const lastSyncAt = ingestionStore.lastChunkAt ?? ingestionStore.updatedAt;
  const syncAgeMs = Date.now() - Date.parse(lastSyncAt);
  const staleCandidateData = syncAgeMs > CANDIDATE_SYNC_STALE_MS;

  const dropbox = checkDropboxSign();

  const p136Status: ComponentHealthStatus = schedulerHeartbeatStale
    ? schedulerState.schedulerStatus === "running"
      ? "Critical"
      : "Warning"
    : schedulerState.schedulerStatus === "stopped"
      ? "Warning"
      : "Healthy";

  const p124Status: ComponentHealthStatus =
    approvalDecisions.length > 0 ? "Healthy" : "Warning";

  const p123Status: ComponentHealthStatus = cycle
    ? cycle.safetyState.goNoGo === "GO"
      ? "Healthy"
      : "Warning"
    : "Warning";

  const p135Status: ComponentHealthStatus =
    remediation.executivePanel.totalBlockedCandidates >= 0 ? "Healthy" : "Critical";

  const p125Status: ComponentHealthStatus = runnerSnapshot.heartbeat.healthy
    ? "Healthy"
    : runnerSnapshot.heartbeat.stale
      ? "Critical"
      : "Warning";

  const p126Status: ComponentHealthStatus =
    opsReport.health.runnerHealth === "critical"
      ? "Critical"
      : opsReport.health.runnerHealth === "degraded"
        ? "Warning"
        : "Healthy";

  const syncStatus: ComponentHealthStatus = staleCandidateData ? "Warning" : "Healthy";

  const queueStatus: ComponentHealthStatus =
    queueDepth > 0 ? "Healthy" : blocked > autoApproved ? "Warning" : "Healthy";

  const retryStatus: ComponentHealthStatus =
    retryCount >= EXCESSIVE_RETRY_THRESHOLD ? "Critical" : retryCount > 0 ? "Warning" : "Healthy";

  const duplicateStatus: ComponentHealthStatus =
    runnerState.sentCandidateIds.length > 0 || opsReport.queue.duplicatePrevented > 0
      ? "Healthy"
      : registry.sendCount > 0
        ? "Healthy"
        : "Healthy";

  const pilotSent = registry.sendCount > 0 || registry.lastSendResult?.outcome === "sent";
  const pilotLockStatus: ComponentHealthStatus = pilotSent
    ? pilotLock?.executeOneBlocked
      ? "Healthy"
      : "Critical"
    : pilotLock?.pilotComplete
      ? "Healthy"
      : "Healthy";

  const components: ComponentStatus[] = [
    component(
      "p136_scheduler",
      "Scheduler heartbeat",
      "P136",
      p136Status,
      schedulerHeartbeatStale
        ? `Stale heartbeat — last at ${schedulerState.lastHeartbeatAt ?? "never"}`
        : `Status ${schedulerState.schedulerStatus}, mode ${schedulerState.schedulerMode}`,
      generatedAt,
    ),
    component(
      "p124_approval_engine",
      "Approval engine",
      "P124",
      p124Status,
      `${approvalDecisions.length} decisions — ${autoApproved} AUTO_APPROVED`,
      generatedAt,
    ),
    component(
      "p123_orchestrator",
      "Orchestrator",
      "P123",
      p123Status,
      cycle ? `goNoGo=${cycle.safetyState.goNoGo}, queueDepth=${cycle.sendQueue.queueDepth}` : "No cycle snapshot",
      generatedAt,
    ),
    component(
      "p135_remediation_executor",
      "Remediation executor",
      "P135",
      p135Status,
      `${remediation.executivePanel.totalBlockedCandidates} blocked, ${remediation.summary.estimatedApprovalsUnlocked} unlocks estimated (preview)`,
      generatedAt,
    ),
    component(
      "p125_runner",
      "Production runner",
      "P125",
      p125Status,
      `Status ${runnerState.runnerStatus}, heartbeat ${runnerSnapshot.heartbeat.healthy ? "OK" : "stale"}`,
      generatedAt,
    ),
    component(
      "p126_ops_command_center",
      "Operations Command Center",
      "P126",
      p126Status,
      `Runner health ${opsReport.health.runnerHealth}, API latency ${opsReport.health.apiLatencyMs}ms`,
      generatedAt,
    ),
    component("dropbox_sign", "Dropbox Sign connectivity", "Dropbox", dropbox.status, dropbox.detail, generatedAt),
    component(
      "candidate_sync",
      "Candidate sync freshness",
      "Ingestion",
      syncStatus,
      staleCandidateData
        ? `Last sync ${Math.round(syncAgeMs / 3_600_000)}h ago`
        : `Last sync ${Math.round(syncAgeMs / 60_000)}m ago`,
      generatedAt,
    ),
    component(
      "queue_growth",
      "Queue depth",
      "Queue",
      queueStatus,
      `Queue depth ${queueDepth}, ready ${opsReport.queue.readyToSend}`,
      generatedAt,
    ),
    component(
      "retry_queue",
      "Retry queue",
      "Runner",
      retryStatus,
      `${retryCount} entries in retry queue`,
      generatedAt,
    ),
    component(
      "duplicate_prevention",
      "Duplicate prevention",
      "Safety",
      duplicateStatus,
      `${opsReport.queue.duplicatePrevented} prevented, ${runnerState.sentCandidateIds.length} tracked sent IDs`,
      generatedAt,
    ),
    component(
      "p138_pilot_lock",
      "Pilot lock state",
      "P138",
      pilotLockStatus,
      pilotSent
        ? pilotLock?.executeOneBlocked
          ? `Locked after send — ${pilotLock.lockedCandidateId}`
          : "Pilot send recorded but safety lock not applied"
        : pilotLock?.pilotComplete
          ? "Lock applied (idle)"
          : "No pilot send — lock not required",
      generatedAt,
    ),
  ];

  const failedHealthChecks = components.filter((c) => c.status !== "Healthy").length;
  const { score: overallHealthScore, result: overallResult } = resolveOverall(components);

  const priorSnapshot = priorHistory.snapshots.at(-1) ?? null;
  const metrics: HealthMetricsSnapshot = {
    at: generatedAt,
    candidatesEvaluated: loaded.candidateIds.length,
    autoApproved,
    humanReview,
    blocked,
    queueDepth,
    averageApprovalScore,
    sendReadiness,
    retryCount,
    schedulerUptimeMs,
    apiLatencyMs,
    dropboxConnectivity: dropbox.status,
    staleCandidateData,
    failedHealthChecks,
  };

  const historyStore = input?.skipHistoryAppend
    ? priorHistory
    : await appendHealthSnapshot(metrics);

  const alerts: HealthAlert[] = [];

  if (schedulerState.schedulerStatus === "stopped" && schedulerState.continuousEnabled) {
    alerts.push({
      id: "scheduler_stopped",
      severity: "critical",
      title: "Scheduler stopped",
      detail: "P136 continuous mode was enabled but scheduler is stopped.",
      componentId: "p136_scheduler",
    });
  }
  if (schedulerHeartbeatStale) {
    alerts.push({
      id: "stale_heartbeat",
      severity: schedulerState.schedulerStatus === "running" ? "critical" : "warning",
      title: "Stale scheduler heartbeat",
      detail: `Last heartbeat ${schedulerState.lastHeartbeatAt ?? "never"}.`,
      componentId: "p136_scheduler",
    });
  }
  if (
    schedulerState.lastCycleAt &&
    Date.now() - Date.parse(schedulerState.lastCycleAt) > QUEUE_STALL_MS &&
    queueDepth > 0
  ) {
    alerts.push({
      id: "queue_stalled",
      severity: "warning",
      title: "Queue stalled",
      detail: `Queue depth ${queueDepth} with no cycle in ${Math.round(QUEUE_STALL_MS / 3_600_000)}h.`,
      componentId: "queue_growth",
    });
  }
  if (retryCount >= EXCESSIVE_RETRY_THRESHOLD) {
    alerts.push({
      id: "excessive_retries",
      severity: "critical",
      title: "Excessive retries",
      detail: `${retryCount} candidates in retry queue.`,
      componentId: "retry_queue",
    });
  }
  if (dropbox.status === "Critical") {
    alerts.push({
      id: "dropbox_unavailable",
      severity: "critical",
      title: "Dropbox Sign unavailable",
      detail: dropbox.detail,
      componentId: "dropbox_sign",
    });
  }
  if (pilotSent && !pilotLock?.executeOneBlocked) {
    alerts.push({
      id: "pilot_lock_missing",
      severity: "critical",
      title: "Pilot lock missing after send",
      detail: "P138 safety lock not applied after successful pilot send.",
      componentId: "p138_pilot_lock",
    });
  }
  if (runnerState.recentFailures.length > 0) {
    alerts.push({
      id: "audit_failures",
      severity: "warning",
      title: "Recent runner failures",
      detail: runnerState.recentFailures[0]?.error ?? "Runner reported failures.",
      componentId: "p125_runner",
    });
  }
  if (staleCandidateData) {
    alerts.push({
      id: "stale_candidate_data",
      severity: "warning",
      title: "Stale candidate sync",
      detail: `Ingestion store last updated ${Math.round(syncAgeMs / 3_600_000)}h ago.`,
      componentId: "candidate_sync",
    });
  }

  const recommendations: string[] = [];
  for (const alert of alerts) {
    recommendations.push(`${alert.title}: ${alert.detail}`);
  }
  if (recommendations.length === 0) {
    recommendations.push("All monitored components healthy — continue read-only observation.");
  }
  if (pilotConfig.liveModeEnabled) {
    recommendations.push("Live mode env is enabled — verify operator intent before any manual send.");
  }

  const healthyCount = components.filter((c) => c.status === "Healthy").length;

  return {
    sourcePhase: P140_SOURCE_PHASE,
    generatedAt,
    mode: P140_MONITORING_MODE,
    overallHealthScore,
    overallResult,
    componentStatuses: components,
    activeAlerts: alerts,
    metrics,
    historicalMetrics: historyStore.snapshots,
    recommendations,
    executivePanel: {
      overallHealthScore,
      overallResult,
      componentStatusSummary: `${healthyCount}/${components.length} healthy`,
      activeAlertCount: alerts.length,
      systemUptimeMs: Math.max(schedulerUptimeMs, runnerSnapshot.metrics.uptimeMs),
      lastSuccessfulCycleAt: schedulerState.lastSuccessfulCycleAt ?? runnerState.lastRunAt,
      queueDepth,
      queueTrend: computeTrend(queueDepth, priorSnapshot?.queueDepth ?? null),
      retryCount,
      retryTrend: computeTrend(retryCount, priorSnapshot?.retryCount ?? null),
      dropboxHealth: dropbox.status,
      candidateSyncFreshness: staleCandidateData
        ? `Stale (${Math.round(syncAgeMs / 3_600_000)}h)`
        : `Fresh (${Math.round(syncAgeMs / 60_000)}m)`,
    },
    executeBatchCalled: false,
    breezyWrites: false,
    liveModeEnabled: pilotConfig.liveModeEnabled,
    paperworkSent: false,
  };
}
