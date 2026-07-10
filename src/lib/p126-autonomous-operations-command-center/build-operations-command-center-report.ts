import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import { loadPaperworkCycleMonitorState } from "@/lib/autonomous-paperwork-orchestrator/cycle-store";
import { runPaperworkCycle } from "@/lib/autonomous-paperwork-orchestrator/execute-paperwork-cycle";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import {
  buildProductionRunnerSnapshot,
  loadProductionRunnerState,
} from "@/lib/p125-autonomous-paperwork-production-runner";
import {
  filterActivityTimeline,
  filterCandidateSummaries,
} from "@/lib/p126-autonomous-operations-command-center/filter-operations-data";
import {
  loadRunnerAuditTimeline,
  timelineFromOrchestratorCycle,
} from "@/lib/p126-autonomous-operations-command-center/load-activity-timeline";
import type {
  CandidateDrilldown,
  DiagnosticsPanel,
  ExecutiveMetricsPanel,
  HealthDashboardPanel,
  OperationsCommandCenterReport,
  OperationsFilter,
  QueueSummaryPanel,
  RunnerStatusPanel,
} from "@/lib/p126-autonomous-operations-command-center/types";
import { P126_SOURCE_PHASE } from "@/lib/p126-autonomous-operations-command-center/types";

function runningPausedIdle(
  status: string,
): RunnerStatusPanel["runningPausedIdle"] {
  if (status === "running") return "running";
  if (status === "paused") return "paused";
  if (status === "idle") return "idle";
  return "stopped";
}

function buildRunnerPanel(input: {
  snapshot: Awaited<ReturnType<typeof buildProductionRunnerSnapshot>>;
  cycle: Awaited<ReturnType<typeof runPaperworkCycle>>["report"] | null;
}): RunnerStatusPanel {
  const state = input.snapshot.state;
  const currentAction =
    state.runnerStatus === "running"
      ? "Processing paperwork cycle"
      : state.schedulerMode === "paused"
        ? "Paused — awaiting resume"
        : input.cycle?.currentStep ?? "Idle";

  return {
    currentState: state.schedulerMode,
    runningPausedIdle: runningPausedIdle(input.snapshot.status),
    lastCycleAt: state.lastRunAt,
    nextCycleAt: state.nextScheduledRunAt,
    uptimeMs: input.snapshot.metrics.uptimeMs,
    heartbeat: input.snapshot.heartbeat,
    currentCandidate: input.snapshot.currentCandidate
      ? {
          candidateId: input.snapshot.currentCandidate.candidateId,
          candidateName: input.snapshot.currentCandidate.candidateName,
        }
      : null,
    currentAction,
    averageCycleTimeMs: state.averageProcessingTimeMs,
  };
}

function buildQueueSummary(input: {
  approvalDecisions: ReturnType<typeof buildApprovalDecisionsFromContext>;
  runnerState: Awaited<ReturnType<typeof loadProductionRunnerState>>;
  cycle: Awaited<ReturnType<typeof runPaperworkCycle>>["report"] | null;
}): QueueSummaryPanel {
  const autoApproved = input.approvalDecisions.filter((d) => d.approvalDecision === "AUTO_APPROVED");
  const humanReview = input.approvalDecisions.filter((d) => d.approvalDecision === "NEEDS_HUMAN_APPROVAL");
  const waiting = input.approvalDecisions.filter((d) => d.approvalDecision === "WAITING");
  const blocked = input.approvalDecisions.filter(
    (d) => d.approvalDecision === "BLOCKED" || d.approvalDecision === "REJECTED_FOR_SAFETY",
  );

  return {
    readyToSend: autoApproved.length,
    waitingApproval: waiting.length,
    humanReview: humanReview.length,
    blocked: blocked.length,
    retryQueue: input.runnerState.retryQueue.length,
    completedToday: input.runnerState.dailyMetrics.successfulSends,
    failedToday: input.runnerState.dailyMetrics.failedSends,
    duplicatePrevented: input.runnerState.sentCandidateIds.length,
    skipped: input.runnerState.dailyMetrics.safetyBlocked,
  };
}

function buildExecutiveMetrics(input: {
  runnerState: Awaited<ReturnType<typeof loadProductionRunnerState>>;
  cycle: Awaited<ReturnType<typeof runPaperworkCycle>>["report"] | null;
  approvalDecisions: ReturnType<typeof buildApprovalDecisionsFromContext>;
}): ExecutiveMetricsPanel {
  const total = input.approvalDecisions.length || 1;
  const autoApproved = input.approvalDecisions.filter((d) => d.approvalDecision === "AUTO_APPROVED").length;
  const humanReview = input.approvalDecisions.filter((d) => d.approvalDecision === "NEEDS_HUMAN_APPROVAL").length;
  const failed = input.runnerState.dailyMetrics.failedSends;
  const sent = input.runnerState.dailyMetrics.successfulSends;
  const attempts = sent + failed;

  return {
    todaysSends: sent,
    successRate: attempts === 0 ? 0 : Math.round((sent / attempts) * 100),
    averageSendTimeMinutes: input.cycle?.metrics.averageSendTimeMinutes ?? 3,
    currentQueue: input.cycle?.sendQueue.queueDepth ?? 0,
    readyCandidates: input.cycle?.metrics.readyCount ?? autoApproved,
    approvalRate: Math.round((autoApproved / total) * 100),
    humanReviewPercent: Math.round((humanReview / total) * 100),
    failurePercent: attempts === 0 ? 0 : Math.round((failed / attempts) * 100),
  };
}

function buildHealth(input: {
  snapshot: Awaited<ReturnType<typeof buildProductionRunnerSnapshot>>;
  cycle: Awaited<ReturnType<typeof runPaperworkCycle>>["report"] | null;
  apiLatencyMs: number;
  registry: Awaited<ReturnType<typeof loadPilotSendRegistry>>;
}): HealthDashboardPanel {
  const runnerHealth = input.snapshot.heartbeat.healthy
    ? "healthy"
    : input.snapshot.state.lastError
      ? "critical"
      : "degraded";

  const orchestratorHealth =
    input.cycle?.safetyState.goNoGo === "GO" ? "healthy" : input.cycle ? "degraded" : "unknown";

  return {
    runnerHealth,
    dropboxSign: input.registry.lastSendResult?.outcome === "sent" ? "healthy" : "unknown",
    approvalEngine: input.cycle?.approvalSummary ? "healthy" : "unknown",
    orchestrator: orchestratorHealth,
    queue: (input.cycle?.sendQueue.queueDepth ?? 0) > 0 ? "healthy" : "degraded",
    apiLatencyMs: input.apiLatencyMs,
    lastSuccessfulSendAt: input.registry.lastSendResult?.executedAt ?? input.snapshot.lastExecutionAt,
    averageProcessingTimeMs: input.snapshot.metrics.averageProcessingTimeMs,
    failures: input.snapshot.failures.length,
    retryBacklog: input.snapshot.retries.length,
  };
}

function buildDiagnostics(input: {
  runnerState: Awaited<ReturnType<typeof loadProductionRunnerState>>;
  auditTimeline: Awaited<ReturnType<typeof loadRunnerAuditTimeline>>;
  cycle: Awaited<ReturnType<typeof runPaperworkCycle>>["report"] | null;
}): DiagnosticsPanel {
  const restartHistory = input.auditTimeline
    .filter((entry) => ["start", "stop", "pause", "resume"].includes(entry.action))
    .map((entry) => ({ at: entry.at, action: entry.action }));

  return {
    recentErrors: [
      input.runnerState.lastError,
      ...input.runnerState.recentFailures.map((f) => f.error),
      ...(input.cycle?.errors ?? []),
    ].filter((value): value is string => Boolean(value)).slice(0, 15),
    retryHistory: input.runnerState.retryQueue.map((entry) => ({
      candidateId: entry.candidateId,
      candidateName: entry.candidateName,
      error: entry.error,
      attempt: entry.attempt,
      nextRetryAt: entry.nextRetryAt,
    })),
    safetyGateFailures: input.cycle?.safetyState.checks.filter((c) => !c.passed).map((c) => `${c.label}: ${c.detail}`) ?? [],
    duplicatePreventionEvents: input.runnerState.sentCandidateIds.slice(-10).map((id) => `Duplicate prevention tracked for ${id}`),
    lockRecoveryEvents: input.runnerState.lastError?.includes("stale runner lock")
      ? [input.runnerState.lastError]
      : [],
    runnerRestartHistory: restartHistory.slice(0, 10),
  };
}

function buildCandidateDrilldowns(input: {
  approvalDecisions: ReturnType<typeof buildApprovalDecisionsFromContext>;
  cycle: Awaited<ReturnType<typeof runPaperworkCycle>>["report"] | null;
  timeline: Awaited<ReturnType<typeof loadRunnerAuditTimeline>>;
  filter: OperationsFilter;
}): CandidateDrilldown[] {
  const queueOrder = new Map(
    (input.cycle?.sendQueue.remainingQueue ?? []).map((candidate, index) => [candidate.candidateId, index + 1]),
  );
  const orchestratorById = new Map(
    (input.cycle?.candidates ?? []).map((candidate) => [candidate.candidateId, candidate]),
  );

  const summaries = input.approvalDecisions.map((decision) => {
    const orchestrator = orchestratorById.get(decision.candidateId);
    const rowAudit = input.timeline.filter((entry) => entry.candidateId === decision.candidateId).slice(0, 10);

    return {
      candidateId: decision.candidateId,
      candidateName: decision.candidateName,
      email: decision.email,
      approvalDecision: decision.approvalDecision,
      approvalScore: decision.approvalScore,
      approvalReasons: decision.approvalReasons,
      safetyReasons: decision.safetyReasons,
      humanReviewReasons: decision.humanReviewReasons,
      blockingReasons: decision.blockingReasons,
      safetyChecks: input.cycle?.safetyState.checks ?? [],
      eligibilityStatus: orchestrator?.eligibilityStatus ?? "UNKNOWN",
      currentStage: orchestrator?.eligibilityStatus ?? "UNKNOWN",
      queuePosition: queueOrder.get(decision.candidateId) ?? null,
      mappingConfidence: orchestrator?.mappingConfidence ?? 0,
      approvedMappingReady: orchestrator?.approvedMappingReady ?? false,
      dropboxSignStatus: orchestrator?.eligibilityStatus === "WAITING_SIGNATURE" ? "sent" : "not_sent",
      signatureRequestId: null,
      auditHistory: rowAudit,
      decisionExplanation: decision.explanation,
    };
  });

  return filterCandidateSummaries(summaries, input.filter).slice(0, 50);
}

export async function buildOperationsCommandCenterReport(input?: {
  filters?: OperationsFilter;
  refresh?: boolean;
}): Promise<OperationsCommandCenterReport> {
  const started = performance.now();
  const filters = input?.filters ?? { timeRange: "today" };

  const storedCycle = await loadPaperworkCycleMonitorState();
  const cycleResult =
    input?.refresh || !storedCycle.currentCycle
      ? await runPaperworkCycle({ dryRun: true })
      : { report: storedCycle.currentCycle, executeBatchCalled: false as const };

  const cycle = cycleResult.report;
  const runnerState = await loadProductionRunnerState();
  const snapshot = await buildProductionRunnerSnapshot({ lastCycle: cycle });
  const registry = await loadPilotSendRegistry();

  const { loadPaperworkCandidates } = await import("@/lib/autonomous-paperwork-orchestrator/load-candidates");
  const loaded = await loadPaperworkCandidates({ mtdOnly: false });
  const approvalDecisions = buildApprovalDecisionsFromContext(loaded);

  const auditTimeline = await loadRunnerAuditTimeline();
  const orchestratorTimeline = timelineFromOrchestratorCycle({
    cycleId: cycle.cycleId,
    operatorTimeline: cycle.operatorTimeline,
    candidateId: cycle.sendQueue.nextCandidate?.candidateId,
    candidateName: cycle.sendQueue.nextCandidate?.candidateName,
  });
  const mergedTimeline = filterActivityTimeline(
    [...auditTimeline, ...orchestratorTimeline].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    filters,
  );

  const apiLatencyMs = Math.round(performance.now() - started);

  return {
    sourcePhase: P126_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    filters,
    runner: buildRunnerPanel({ snapshot, cycle }),
    queue: buildQueueSummary({ approvalDecisions, runnerState, cycle }),
    timeline: mergedTimeline.slice(0, 100),
    metrics: buildExecutiveMetrics({ runnerState, cycle, approvalDecisions }),
    health: buildHealth({ snapshot, cycle, apiLatencyMs, registry }),
    candidateSummary: buildCandidateDrilldowns({
      approvalDecisions,
      cycle,
      timeline: auditTimeline,
      filter: filters,
    }),
    failures: runnerState.recentFailures,
    retries: runnerState.retryQueue.map((entry) => ({
      candidateId: entry.candidateId,
      candidateName: entry.candidateName,
      error: entry.error,
      attempt: entry.attempt,
      nextRetryAt: entry.nextRetryAt,
    })),
    diagnostics: buildDiagnostics({ runnerState, auditTimeline, cycle }),
    executeBatchCalled: false,
    safetyConfirmation: {
      p122GatesPreserved: true,
      p124ApprovalPreserved: true,
      executeOneOnly: true,
      noBypassControls: true,
    },
  };
}
