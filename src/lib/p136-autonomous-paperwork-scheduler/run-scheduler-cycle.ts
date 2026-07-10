import { randomUUID } from "node:crypto";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { buildApprovalDecisionsFromContext } from "@/lib/autonomous-paperwork-approval-engine/build-approval-report";
import { runPaperworkCycle } from "@/lib/autonomous-paperwork-orchestrator/execute-paperwork-cycle";
import { loadPaperworkCandidates } from "@/lib/autonomous-paperwork-orchestrator/load-candidates";
import { evaluatePilotCandidate } from "@/lib/p122-controlled-live-paperwork-pilot/evaluate-pilot-candidate";
import { loadPilotConfig } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-config";
import { loadPilotSendRegistry } from "@/lib/p122-controlled-live-paperwork-pilot/pilot-store";
import { buildOperationsCommandCenterReport } from "@/lib/p126-autonomous-operations-command-center/build-operations-command-center-report";
import { buildPaperworkRemediationExecutorReport } from "@/lib/p135-paperwork-remediation-executor/build-paperwork-remediation-executor-report";
import {
  appendSchedulerAudit,
  releaseSchedulerLock,
  touchSchedulerHeartbeat,
  tryAcquireSchedulerLock,
} from "@/lib/p136-autonomous-paperwork-scheduler/scheduler-store";
import type {
  SchedulerCycleMetrics,
  SchedulerCycleReport,
  SchedulerExecutiveSummary,
  SchedulerMode,
  SchedulerPhase,
  SchedulerSafetyStatus,
} from "@/lib/p136-autonomous-paperwork-scheduler/types";
import { P136_SOURCE_PHASE } from "@/lib/p136-autonomous-paperwork-scheduler/types";

const PHASES: SchedulerPhase[] = [
  "refresh_candidate_data",
  "remediation_executor_preview",
  "approval_engine",
  "orchestrator",
  "build_send_queue",
  "p122_readiness",
  "update_ops_command_center",
  "generate_executive_summary",
  "sleep",
];

function buildSafetyStatus(liveModeEnabled: boolean): SchedulerSafetyStatus {
  return {
    previewOnly: true,
    breezyWrites: false,
    liveModeEnabled,
    paperworkSent: false,
    executeBatchCalled: false,
    p122Unchanged: true,
    checks: [
      { id: "preview_only", label: "Preview-only orchestration", passed: true, detail: "No live sends." },
      { id: "no_breezy_writes", label: "No Breezy writes", passed: true, detail: "Read-only coordination." },
      { id: "no_execute_batch", label: "No executeBatch", passed: true, detail: "executeOne path only." },
      { id: "p122_unchanged", label: "P122 logic unchanged", passed: true, detail: "Readiness evaluation only." },
      {
        id: "live_mode_off",
        label: "Live mode disabled",
        passed: !liveModeEnabled,
        detail: liveModeEnabled ? "Live mode enabled in env." : "Live mode off.",
      },
    ],
  };
}

export async function runSchedulerCycle(input?: {
  mode?: SchedulerMode;
  maxRemediationCandidates?: number;
  skipOpsCenter?: boolean;
  loadCandidates?: typeof loadPaperworkCandidates;
  runPaperworkCycleFn?: typeof runPaperworkCycle;
}): Promise<SchedulerCycleReport> {
  const mode = input?.mode ?? "oneCycle";
  const cycleId = randomUUID();
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const phasesCompleted: SchedulerPhase[] = [];
  const pilotConfig = loadPilotConfig();

  if (mode === "paused") {
    return {
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: 0,
      mode,
      phasesCompleted: [],
      currentPhase: null,
      metrics: emptyMetrics(),
      executiveSummary: emptySummary(),
      safetyStatus: buildSafetyStatus(pilotConfig.liveModeEnabled),
      skippedOverlap: false,
      skippedPaused: true,
      error: null,
    };
  }

  const lock = await tryAcquireSchedulerLock({ mode, phase: "refresh_candidate_data" });
  if (!lock.acquired) {
    return {
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      mode,
      phasesCompleted: [],
      currentPhase: null,
      metrics: emptyMetrics(),
      executiveSummary: emptySummary(),
      safetyStatus: buildSafetyStatus(pilotConfig.liveModeEnabled),
      skippedOverlap: true,
      skippedPaused: false,
      error: null,
    };
  }

  let error: string | null = null;
  let metrics = emptyMetrics();
  let executiveSummary = emptySummary();

  try {
    await touchSchedulerHeartbeat("refresh_candidate_data");
    const loadFn = input?.loadCandidates ?? loadPaperworkCandidates;
    const context = await loadFn({ mtdOnly: false });
    phasesCompleted.push("refresh_candidate_data");
    metrics.candidatesEvaluated = context.candidateIds.length;

    await touchSchedulerHeartbeat("remediation_executor_preview");
    const remediation = await buildPaperworkRemediationExecutorReport({
      previewOnly: true,
      maxCandidates: input?.maxRemediationCandidates ?? 15,
      tierFilter: [1, 2],
      contextOverride: context,
    });
    phasesCompleted.push("remediation_executor_preview");
    metrics.remediationsExecuted = remediation.summary.automaticFixesCompleted;
    metrics.manualActionsRemaining = remediation.summary.manualFixesRemaining;
    metrics.approvalsUnlocked = remediation.summary.estimatedApprovalsUnlocked;

    await touchSchedulerHeartbeat("approval_engine");
    const approvalDecisions = buildApprovalDecisionsFromContext(context);
    phasesCompleted.push("approval_engine");
    metrics.autoApproved = approvalDecisions.filter((d) => d.approvalDecision === "AUTO_APPROVED").length;
    metrics.humanReview = approvalDecisions.filter((d) => d.approvalDecision === "NEEDS_HUMAN_APPROVAL").length;
    metrics.blocked = approvalDecisions.filter(
      (d) => d.approvalDecision === "BLOCKED" || d.approvalDecision === "REJECTED_FOR_SAFETY",
    ).length;

    await touchSchedulerHeartbeat("orchestrator");
    const runCycle = input?.runPaperworkCycleFn ?? runPaperworkCycle;
    const orchestrator = await runCycle({ dryRun: true, contextOverride: context });
    phasesCompleted.push("orchestrator");

    await touchSchedulerHeartbeat("build_send_queue");
    const sendQueue = orchestrator.report.sendQueue;
    phasesCompleted.push("build_send_queue");
    metrics.queueSize = sendQueue?.queueDepth ?? 0;

    await touchSchedulerHeartbeat("p122_readiness");
    const registry = await loadPilotSendRegistry();
    let readinessCount = 0;
    for (const entry of sendQueue?.remainingQueue ?? []) {
      const row = context.rowsByCandidateId.get(entry.candidateId) ?? null;
      const approvedMapping = context.approvedMappingsByCandidate.get(entry.candidateId) ?? null;
      const evaluation = evaluatePilotCandidate({
        candidateId: entry.candidateId,
        row,
        onboarding: context.onboardingByCandidateId.get(entry.candidateId) ?? null,
        jobsByPositionId: context.jobsByPositionId,
        closedJobsByPositionId: context.closedJobsByPositionId,
        publishedJobs: context.publishedJobs,
        paperworkByGrade: DEFAULT_PAPERWORK_BY_GRADE,
        p100SentIds: context.p100SentIds,
        pilotSentIds: context.pilotSentIds,
        approvedMapping,
        config: pilotConfig,
        pilotSendCount: registry.sendCount,
      });
      if (evaluation.status === "ready_to_send") readinessCount += 1;
    }
    phasesCompleted.push("p122_readiness");
    metrics.readinessCount = readinessCount;
    metrics.estimatedPaperworkCapacity = readinessCount;

    await touchSchedulerHeartbeat("update_ops_command_center");
    if (!input?.skipOpsCenter) {
      await buildOperationsCommandCenterReport({ filters: { timeRange: "today" }, refresh: false });
    }
    phasesCompleted.push("update_ops_command_center");

    await touchSchedulerHeartbeat("generate_executive_summary");
    executiveSummary = {
      headline: `P136 cycle — ${metrics.autoApproved} AUTO_APPROVED, ${metrics.approvalsUnlocked} unlocks after remediation preview`,
      candidatesEvaluated: metrics.candidatesEvaluated,
      autoApproved: metrics.autoApproved,
      remediationsCompleted: metrics.remediationsExecuted,
      approvalsUnlocked: metrics.approvalsUnlocked,
      queueSize: metrics.queueSize,
      readinessCount: metrics.readinessCount,
      safetyStatus: pilotConfig.liveModeEnabled ? "DEGRADED" : "SAFE_PREVIEW",
      safetyDetail: pilotConfig.liveModeEnabled
        ? "Live mode env enabled — scheduler remains preview-only."
        : "Preview-only orchestration — no sends or Breezy writes.",
    };
    phasesCompleted.push("generate_executive_summary");

    await touchSchedulerHeartbeat("sleep");
    phasesCompleted.push("sleep");

    await appendSchedulerAudit({
      action: "cycle_complete",
      cycleId,
      mode,
      metrics,
      phasesCompleted,
    });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    await appendSchedulerAudit({ action: "cycle_failed", cycleId, mode, error });
  }

  const durationMs = Date.now() - startedMs;
  const success = !error;

  await releaseSchedulerLock({
    runId: lock.runId,
    success,
    error,
    durationMs,
    metrics,
  });

  return {
    cycleId,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs,
    mode,
    phasesCompleted,
    currentPhase: null,
    metrics,
    executiveSummary,
    safetyStatus: buildSafetyStatus(pilotConfig.liveModeEnabled),
    skippedOverlap: false,
    skippedPaused: false,
    error,
  };
}

function emptyMetrics(): SchedulerCycleMetrics {
  return {
    candidatesEvaluated: 0,
    autoApproved: 0,
    humanReview: 0,
    blocked: 0,
    remediationsExecuted: 0,
    manualActionsRemaining: 0,
    approvalsUnlocked: 0,
    queueSize: 0,
    readinessCount: 0,
    estimatedPaperworkCapacity: 0,
  };
}

function emptySummary(): SchedulerExecutiveSummary {
  return {
    headline: "No cycle executed.",
    candidatesEvaluated: 0,
    autoApproved: 0,
    remediationsCompleted: 0,
    approvalsUnlocked: 0,
    queueSize: 0,
    readinessCount: 0,
    safetyStatus: "SAFE_PREVIEW",
    safetyDetail: "Idle.",
  };
}

export { P136_SOURCE_PHASE, PHASES };
