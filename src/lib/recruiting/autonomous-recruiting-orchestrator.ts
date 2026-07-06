import type { AuthSession } from "@/lib/auth/types";
import { buildControlledPaperworkAutomationSnapshot } from "@/lib/p145-controlled-paperwork-automation/build-controlled-paperwork-automation-snapshot";
import {
  buildPaperworkAutomationBundle,
  type PaperworkAutomationBundle,
} from "@/lib/p145-controlled-paperwork-automation/load-controlled-paperwork-automation";
import {
  appendOrchestratorAudit,
  appendOrchestratorRunRecord,
  getOrchestratorMaxRuntimeSeconds,
  isAutonomousRecruitingEnabled,
  loadOrchestratorRunHistory,
  loadOrchestratorState,
  releaseOrchestratorLock,
  touchOrchestratorPhase,
  tryAcquireOrchestratorLock,
} from "@/lib/p148-autonomous-recruiting-orchestrator/orchestrator-store";
import type {
  AutonomousRecruitingCycleResult,
  OrchestratorAlert,
  OrchestratorPhase,
  OrchestratorRunRecord,
  OrchestratorStatusSnapshot,
  PhaseTiming,
} from "@/lib/p148-autonomous-recruiting-orchestrator/types";
import { P148_SOURCE_PHASE as SOURCE_PHASE } from "@/lib/p148-autonomous-recruiting-orchestrator/types";
import {
  buildRecruitingLiveSnapshot,
  type RecruitingLiveSnapshotResult,
} from "@/lib/recruiting-live-snapshot";
import {
  executeAutoSendPaperworkReminders,
  isP146AutoSendEnabled,
  type AutoSendExecutionSummary,
} from "@/lib/recruiting/paperwork-execution-engine";
import {
  executeInitialPaperworkAutoSend,
  isP147InitialPaperworkAutoSendEnabled,
  type InitialPaperworkExecutionSummary,
} from "@/lib/recruiting/initial-paperwork-execution-engine";

const PHASE_ORDER: OrchestratorPhase[] = [
  "refresh_live_snapshot",
  "candidate_intelligence",
  "build_paperwork_queue",
  "auto_reminder_processing",
  "initial_paperwork_processing",
  "generate_executive_metrics",
  "persist_run_summary",
];

type PhaseContext = {
  session: AuthSession;
  effectiveDryRun: boolean;
  liveSnapshot: RecruitingLiveSnapshotResult | null;
  bundle: PaperworkAutomationBundle | null;
  reminderSummary: AutoSendExecutionSummary | null;
  initialSummary: InitialPaperworkExecutionSummary | null;
  snapshotCacheHit: boolean;
};

async function runPhase(
  phase: OrchestratorPhase,
  ctx: PhaseContext,
  timings: PhaseTiming[],
  failures: string[],
  warnings: string[],
  runId: string,
): Promise<void> {
  const started = Date.now();
  let success = true;
  let error: string | undefined;
  let recoveryAction: string | undefined;
  let cacheHit: boolean | undefined;

  try {
    switch (phase) {
      case "refresh_live_snapshot": {
        ctx.liveSnapshot = await buildRecruitingLiveSnapshot({ force: true });
        if (!ctx.liveSnapshot.ok) {
          warnings.push(`Live snapshot partial: ${ctx.liveSnapshot.error ?? "unavailable"}`);
          recoveryAction = "Continue with cached ingestion fallback.";
        }
        break;
      }
      case "candidate_intelligence":
      case "build_paperwork_queue": {
        if (phase === "candidate_intelligence" && ctx.bundle) {
          cacheHit = true;
          break;
        }
        ctx.bundle = await buildPaperworkAutomationBundle(ctx.session, {
          liveSnapshot: ctx.liveSnapshot,
        });
        cacheHit = ctx.liveSnapshot != null;
        if (ctx.bundle.partialSync) {
          warnings.push("Partial sync during bundle build.");
        }
        break;
      }
      case "auto_reminder_processing": {
        if (!ctx.bundle) throw new Error("Paperwork bundle unavailable.");
        const autoSendEnabled = !ctx.effectiveDryRun && isP146AutoSendEnabled();
        ctx.reminderSummary = await executeAutoSendPaperworkReminders({
          contexts: ctx.bundle.contexts,
          auditEvents: ctx.bundle.auditEvents,
          dryRun: ctx.effectiveDryRun || !autoSendEnabled,
          autoSendEnabled,
          userId: ctx.session.userId,
          userEmail: ctx.session.email,
          referenceMs: Date.parse(ctx.bundle.meta.refreshedAt),
        });
        break;
      }
      case "initial_paperwork_processing": {
        if (!ctx.bundle) throw new Error("Paperwork bundle unavailable.");
        const autoSendEnabled = !ctx.effectiveDryRun && isP147InitialPaperworkAutoSendEnabled();
        ctx.initialSummary = await executeInitialPaperworkAutoSend({
          contexts: ctx.bundle.contexts,
          advancements: ctx.bundle.advancements,
          auditEvents: ctx.bundle.auditEvents,
          onboardingPolicy: ctx.bundle.onboardingPolicy,
          dryRun: ctx.effectiveDryRun || !autoSendEnabled,
          autoSendEnabled,
          userId: ctx.session.userId,
          userEmail: ctx.session.email,
          referenceMs: Date.parse(ctx.bundle.meta.refreshedAt),
        });
        break;
      }
      case "generate_executive_metrics": {
        if (!ctx.bundle) throw new Error("Paperwork bundle unavailable.");
        buildControlledPaperworkAutomationSnapshot({
          queue: ctx.bundle.queue,
          generatedAt: new Date().toISOString(),
          partialSync: ctx.bundle.partialSync,
          candidatesEvaluated: ctx.bundle.candidatesEvaluated,
          recentAuditEvents: ctx.bundle.auditEvents,
          executionMode: "approval",
          contexts: ctx.bundle.contexts,
          advancements: ctx.bundle.advancements,
          lastAutoSendSummary: ctx.reminderSummary,
          lastInitialPaperworkSummary: ctx.initialSummary,
          referenceMs: Date.parse(ctx.bundle.meta.refreshedAt),
        });
        break;
      }
      case "persist_run_summary":
        break;
      default:
        break;
    }
  } catch (phaseError) {
    success = false;
    error = phaseError instanceof Error ? phaseError.message : String(phaseError);
    failures.push(`${phase}: ${error}`);
    recoveryAction = "Continue remaining safe phases.";
  }

  timings.push({
    phase,
    success,
    durationMs: Date.now() - started,
    error,
    recoveryAction,
    cacheHit,
  });

  await touchOrchestratorPhase(runId, phase);
}

function buildAlerts(input: {
  result: AutonomousRecruitingCycleResult;
  history: OrchestratorRunRecord[];
  maxRuntimeSeconds: number;
}): OrchestratorAlert[] {
  const alerts: OrchestratorAlert[] = [];
  const recent = input.history.slice(0, 5);

  const recentFailures = recent.filter((r) => !r.success).length;
  if (recentFailures >= 3) {
    alerts.push({
      id: "repeated_failures",
      severity: "critical",
      message: "Repeated orchestrator failures",
      detail: `${recentFailures} of last 5 runs failed.`,
    });
  }

  if (input.result.durationMs > input.maxRuntimeSeconds * 1000) {
    alerts.push({
      id: "excessive_runtime",
      severity: "warning",
      message: "Excessive runtime",
      detail: `Run took ${input.result.durationMs}ms (max ${input.maxRuntimeSeconds}s).`,
    });
  }

  if (input.result.paperworkQueueCount > 50) {
    alerts.push({
      id: "growing_paperwork_queue",
      severity: "warning",
      message: "Growing paperwork queue",
      detail: `${input.result.paperworkQueueCount} items in queue.`,
    });
  }

  if (input.result.blockedCandidates > 20) {
    alerts.push({
      id: "high_blocked_count",
      severity: "warning",
      message: "High blocked candidate count",
      detail: `${input.result.blockedCandidates} candidates blocked.`,
    });
  }

  const lastSuccess = input.history.find((r) => r.success);
  if (!lastSuccess && input.history.length >= 3) {
    alerts.push({
      id: "no_successful_runs",
      severity: "critical",
      message: "No successful runs",
      detail: "No successful orchestrator run in recent history.",
    });
  }

  return alerts;
}

function buildObservability(timings: PhaseTiming[], stateSkippedRuns: number): {
  phaseTimings: PhaseTiming[];
  cacheHitRate: number;
  apiLatencyMs: number;
  executionCount: number;
  skippedRuns: number;
} {
  const cachePhases = timings.filter((t) => t.cacheHit === true);
  const cacheHitRate =
    timings.length === 0 ? 0 : Math.round((cachePhases.length / timings.length) * 100);
  const apiLatencyMs = timings.find((t) => t.phase === "refresh_live_snapshot")?.durationMs ?? 0;

  return {
    phaseTimings: timings,
    cacheHitRate,
    apiLatencyMs,
    executionCount: timings.length,
    skippedRuns: stateSkippedRuns,
  };
}

export async function runAutonomousRecruitingCycle(input: {
  session: AuthSession;
  dryRun?: boolean;
}): Promise<AutonomousRecruitingCycleResult> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const orchestratorEnabled = isAutonomousRecruitingEnabled();
  const effectiveDryRun = input.dryRun !== false || !orchestratorEnabled;
  const maxRuntimeSeconds = getOrchestratorMaxRuntimeSeconds();

  const lock = await tryAcquireOrchestratorLock({
    dryRun: effectiveDryRun,
    phase: "refresh_live_snapshot",
  });

  if (!lock.acquired) {
    const skipped: AutonomousRecruitingCycleResult = {
      runId: lock.runId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      candidatesEvaluated: 0,
      paperworkQueueCount: 0,
      remindersSent: 0,
      initialPaperworkSent: 0,
      blockedCandidates: 0,
      failures: [],
      warnings: ["Skipped: overlapping orchestrator run."],
      success: true,
      dryRun: effectiveDryRun,
      skipped: true,
      skipReason: "overlapping_run",
      phaseTimings: [],
      observability: {
        phaseTimings: [],
        cacheHitRate: 0,
        apiLatencyMs: 0,
        executionCount: 0,
        skippedRuns: lock.state.skippedRunCount + 1,
      },
      alerts: [],
      breezyWrites: false,
      executeBatchCalled: false,
      paperworkSent: false,
    };

    await releaseOrchestratorLock({
      runId: lock.runId,
      success: true,
      durationMs: skipped.durationMs,
      result: skipped,
      skipped: true,
    });
    await appendOrchestratorAudit({ type: "skipped_overlap", runId: lock.runId });
    return skipped;
  }

  const runId = lock.runId;
  const timings: PhaseTiming[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  const ctx: PhaseContext = {
    session: input.session,
    effectiveDryRun,
    liveSnapshot: null,
    bundle: null,
    reminderSummary: null,
    initialSummary: null,
    snapshotCacheHit: false,
  };

  let postSnapshotBudgetStartMs: number | null = null;

  for (const phase of PHASE_ORDER) {
    if (phase === "refresh_live_snapshot") {
      await runPhase(phase, ctx, timings, failures, warnings, runId);
      postSnapshotBudgetStartMs = Date.now();
      continue;
    }

    const budgetStart = postSnapshotBudgetStartMs ?? startedMs;
    if (Date.now() - budgetStart > maxRuntimeSeconds * 1000) {
      warnings.push(`Max runtime (${maxRuntimeSeconds}s) exceeded before ${phase}.`);
      break;
    }
    await runPhase(phase, ctx, timings, failures, warnings, runId);
  }

  const remindersSent = ctx.reminderSummary?.sentCount ?? 0;
  const initialPaperworkSent = ctx.initialSummary?.sentCount ?? 0;
  const blockedCandidates =
    (ctx.reminderSummary?.blockedCount ?? 0) + (ctx.initialSummary?.blockedCount ?? 0);
  const paperworkSent =
    (ctx.reminderSummary?.paperworkSent ?? false) || (ctx.initialSummary?.paperworkSent ?? false);

  const result: AutonomousRecruitingCycleResult = {
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    candidatesEvaluated: ctx.bundle?.candidatesEvaluated ?? 0,
    paperworkQueueCount: ctx.bundle?.queue.length ?? 0,
    remindersSent,
    initialPaperworkSent,
    blockedCandidates,
    failures,
    warnings,
    success: failures.length === 0,
    dryRun: effectiveDryRun,
    phaseTimings: timings,
    observability: buildObservability(timings, lock.state.skippedRunCount),
    alerts: [],
    breezyWrites: false,
    executeBatchCalled: false,
    paperworkSent,
  };

  const history = await loadOrchestratorRunHistory();
  result.alerts = buildAlerts({ result, history, maxRuntimeSeconds });
  result.observability.skippedRuns = lock.state.skippedRunCount;

  const record: OrchestratorRunRecord = { ...result, sourcePhase: SOURCE_PHASE };
  await appendOrchestratorRunRecord(record);
  await appendOrchestratorAudit({
    type: "cycle_complete",
    runId,
    success: result.success,
    dryRun: effectiveDryRun,
    durationMs: result.durationMs,
  });

  await releaseOrchestratorLock({
    runId,
    success: result.success,
    error: failures[0] ?? null,
    durationMs: result.durationMs,
    result,
  });

  return result;
}

export async function buildOrchestratorStatusSnapshot(): Promise<OrchestratorStatusSnapshot> {
  const state = await loadOrchestratorState();
  const last = state.lastCycleResult;
  const enabled = isAutonomousRecruitingEnabled();

  return {
    sourcePhase: SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    automationStatus: state.orchestratorStatus,
    enabled,
    dryRunOnly: !enabled,
    lastSuccessfulRun: state.lastSuccessfulRunAt,
    currentRun: state.processingLock,
    lastRunDurationMs: state.lastRunDurationMs,
    candidatesEvaluated: last?.candidatesEvaluated ?? 0,
    paperworkQueueCount: last?.paperworkQueueCount ?? 0,
    remindersSent: last?.remindersSent ?? 0,
    initialPaperworkSent: last?.initialPaperworkSent ?? 0,
    blockedCandidates: last?.blockedCandidates ?? 0,
    failures: last?.failures ?? [],
    warnings: last?.warnings ?? [],
    nextScheduledRun: state.nextScheduledRunAt,
    scheduleIntervalMinutes: state.scheduleIntervalMinutes,
    alerts: last?.alerts ?? [],
    observability: last?.observability ?? null,
    breezyWrites: false,
    executeBatchCalled: false,
  };
}

export { isAutonomousRecruitingEnabled };
