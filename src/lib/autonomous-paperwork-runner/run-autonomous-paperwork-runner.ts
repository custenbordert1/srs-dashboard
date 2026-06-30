import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { runCandidateIngestionSync } from "@/lib/candidate-ingestion/run-ingestion-sync";
import {
  appendRunnerAudit,
  loadRunnerState,
  releaseRunnerLock,
  runnerAuditPath,
  runnerStatePath,
  saveRunnerState,
  tryAcquireRunnerLock,
} from "@/lib/autonomous-paperwork-runner/runner-store";
import {
  computeRunnerCheckpoint,
  selectCandidatesForRunnerCycle,
} from "@/lib/autonomous-paperwork-runner/select-candidates-for-runner";
import {
  P106_1_DEFAULT_MODE,
  P106_1_SOURCE_PHASE,
  type AutonomousPaperworkRunnerCycleMetrics,
  type AutonomousPaperworkRunnerCycleResult,
  type AutonomousPaperworkRunnerMode,
  type AutonomousPaperworkRunnerReport,
} from "@/lib/autonomous-paperwork-runner/types";
import { runAutonomousPaperworkEngine } from "@/lib/p106-autonomous-paperwork-engine";
import type {
  AutonomousPaperworkCandidateResult,
  AutonomousPaperworkRunMode,
} from "@/lib/p106-autonomous-paperwork-engine/types";

function mapRunnerModeToEngineMode(mode: AutonomousPaperworkRunnerMode): AutonomousPaperworkRunMode {
  if (mode === "dryRun" || mode === "fullReconciliation") return "dryRun";
  return "executeOne";
}

function buildCycleMetrics(input: {
  candidates: AutonomousPaperworkCandidateResult[];
  newCandidateIds: string[];
  sendsThisRun: number;
  autoRepaired: number;
  breezySyncOk: boolean;
}): AutonomousPaperworkRunnerCycleMetrics {
  const blocked = input.candidates.filter((c) => c.category === "blocked");
  return {
    candidatesEvaluated: input.candidates.length,
    newCandidates: input.newCandidateIds.length,
    candidatesSent: input.sendsThisRun,
    skippedAlreadySent: input.candidates.filter((c) => c.category === "skipped_already_sent").length,
    blocked: blocked.length,
    blockedInvalidEmail: blocked.filter((c) => c.blockerCategory === "invalid_email").length,
    blockedDuplicate: blocked.filter((c) => c.blockerCategory === "duplicate_risk").length,
    blockedUnpublishedJob: blocked.filter((c) => c.blockerCategory === "unpublished_job").length,
    blockedClosedJob: blocked.filter((c) => c.blockerCategory === "closed_job").length,
    blockedManualReview: blocked.filter(
      (c) =>
        c.blockerCategory === "unknown_manual_review" ||
        c.blockerCategory === "call_first_required" ||
        c.blockerCategory === "p84_gate_failed",
    ).length,
    autoRepaired: input.autoRepaired,
    breezySyncOk: input.breezySyncOk,
  };
}

function buildRunnerReport(input: {
  mode: AutonomousPaperworkRunnerMode;
  state: Awaited<ReturnType<typeof loadRunnerState>>;
  metrics: AutonomousPaperworkRunnerCycleMetrics;
  candidates: AutonomousPaperworkCandidateResult[];
  overlapPrevented: boolean;
  p106ArtifactPaths: {
    p97Audit: string;
    p97Rollback: string;
    p100Audit: string;
  };
}): AutonomousPaperworkRunnerReport {
  const blocked = input.candidates.filter((c) => c.category === "blocked");
  const ready = input.candidates.filter((c) => c.category === "ready_to_send");
  const nextRun =
    input.state.scheduleEnabled && input.state.lastSuccessfulRunAt
      ? new Date(
          Date.parse(input.state.lastSuccessfulRunAt) + input.state.scheduleIntervalMs,
        ).toISOString()
      : input.state.scheduleEnabled
        ? new Date(Date.now() + input.state.scheduleIntervalMs).toISOString()
        : null;

  return {
    sourcePhase: P106_1_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    sectionTitle: "Autonomous Paperwork Runner",
    mode: input.mode,
    state: input.state,
    metrics: input.metrics,
    currentQueue: [...ready, ...blocked].map((c) => ({
      candidateId: c.candidateId,
      candidateName: c.candidateName,
      category: c.category,
      blockerReason: c.blockerReason,
    })),
    lastCycleCandidates: input.candidates,
    artifactPaths: {
      runnerState: runnerStatePath(),
      runnerAudit: runnerAuditPath(),
      ...input.p106ArtifactPaths,
    },
    runnerHealth: {
      healthy: !input.state.lastError,
      overlapPrevented: input.overlapPrevented,
      lastError: input.state.lastError,
      averageRunTimeMs: input.state.averageRunDurationMs,
    },
    nextScheduledRunAt: nextRun,
  };
}

export async function runAutonomousPaperworkRunnerCycle(input?: {
  mode?: AutonomousPaperworkRunnerMode;
  mtdOnly?: boolean;
  byUserId?: string;
  skipBreezySync?: boolean;
}): Promise<AutonomousPaperworkRunnerCycleResult> {
  const mode = input?.mode ?? P106_1_DEFAULT_MODE;
  const mtdOnly = input?.mtdOnly !== false;
  const warnings: string[] = [
    "P106.1 — no executeBatch; executeOne only when not dryRun.",
    "No Breezy writes.",
    mode === "fullReconciliation"
      ? "fullReconciliation — evaluating all candidates."
      : "Incremental — new, modified, and previously blocked only.",
  ];

  const lock = await tryAcquireRunnerLock({ mode });
  if (!lock.acquired) {
    const state = await loadRunnerState();
    const report = buildRunnerReport({
      mode,
      state,
      metrics: {
        candidatesEvaluated: 0,
        newCandidates: 0,
        candidatesSent: 0,
        skippedAlreadySent: 0,
        blocked: 0,
        blockedInvalidEmail: 0,
        blockedDuplicate: 0,
        blockedUnpublishedJob: 0,
        blockedClosedJob: 0,
        blockedManualReview: 0,
        autoRepaired: 0,
        breezySyncOk: true,
      },
      candidates: [],
      overlapPrevented: true,
      p106ArtifactPaths: {
        p97Audit: ".data/p97-approval-audit.jsonl",
        p97Rollback: ".data/p97-approval-rollback.jsonl",
        p100Audit: ".data/p100-controlled-live-send-audit.jsonl",
      },
    });
    return { ok: true, skippedOverlap: true, mode, report, warnings: [...warnings, "Skipped — previous run still executing."] };
  }

  const started = Date.now();
  let success = false;
  let error: string | null = null;
  let engineResult: Awaited<ReturnType<typeof runAutonomousPaperworkEngine>> | null = null;
  let newCandidateIds: string[] = [];
  let breezySyncOk = true;

  try {
    if (!input?.skipBreezySync) {
      const sync = await runCandidateIngestionSync({
        maxRuntimeMs: 90_000,
        completeCycle: false,
        byUserId: input?.byUserId ?? "p1061-runner",
      });
      breezySyncOk = sync.ok;
      if (!sync.ok) warnings.push(`Breezy sync warning: ${sync.error ?? "unknown"}`);
    }

    const store = await readIngestionStore();
    const stateBefore = await loadRunnerState();
    const selection = selectCandidatesForRunnerCycle({
      store,
      lastSuccessfulRunAt: stateBefore.lastSuccessfulRunAt,
      lastProcessedCheckpoint: stateBefore.lastProcessedCheckpoint,
      blockedRegistry: stateBefore.blockedRegistry,
      fullReconciliation: mode === "fullReconciliation",
      mtdOnly,
    });
    newCandidateIds = selection.newCandidateIds;

    if (selection.candidateIds.length === 0) {
      warnings.push("No candidates require evaluation this cycle.");
      engineResult = {
        ok: true,
        mode: "dryRun",
        stoppedEarly: false,
        stopReason: null,
        sendsThisRun: 0,
        report: {
          sourcePhase: "P106",
          generatedAt: new Date().toISOString(),
          sectionTitle: "Autonomous Paperwork Engine",
          mode: "dryRun",
          mtdOnly,
          metrics: {
            candidatesEvaluated: 0,
            readyToSend: 0,
            sent: 0,
            skippedAlreadySent: 0,
            blockedInvalidEmail: 0,
            blockedUnpublishedJob: 0,
            blockedDuplicateRisk: 0,
            blockedP84: 0,
            blockedManualReview: 0,
            remainingActionNeeded: 0,
            autoRepairedCount: 0,
          },
          readyToSend: [],
          sent: [],
          blocked: [],
          skippedAlreadySent: [],
          candidates: [],
          gates: {
            p99Ready: true,
            p101Go: true,
            p100LocksPass: true,
            liveSendEnabled: false,
            detail: [],
          },
          artifactPaths: {
            p97Audit: ".data/p97-approval-audit.jsonl",
            p97Rollback: ".data/p97-approval-rollback.jsonl",
            p100Audit: ".data/p100-controlled-live-send-audit.jsonl",
          },
          runSummary: "Empty incremental cycle.",
        },
        warnings: [],
      };
    } else {
      engineResult = await runAutonomousPaperworkEngine({
        mode: mapRunnerModeToEngineMode(mode),
        mtdOnly: mode === "fullReconciliation" ? false : mtdOnly,
        candidateIds: selection.candidateIds,
        executiveApprovalFlag: mode !== "dryRun" && mode !== "fullReconciliation",
        approvedBy: "P106.1 Autonomous Paperwork Runner",
        approvedByUserId: input?.byUserId ?? "p1061-runner",
        byUserId: input?.byUserId ?? "p1061-runner",
      });
      warnings.push(...engineResult.warnings);
    }

    const state = await loadRunnerState();
    const blockedRegistry = { ...state.blockedRegistry };
    for (const c of engineResult.report.candidates) {
      if (c.category === "blocked" && c.blockerCategory) {
        blockedRegistry[c.candidateId] = {
          candidateId: c.candidateId,
          candidateName: c.candidateName,
          blockerCategory: c.blockerCategory,
          blockerReason: c.blockerReason ?? c.blockerCategory,
          recommendedFix: c.recommendedFix,
          lastEvaluatedAt: new Date().toISOString(),
        };
      } else if (c.category === "sent" || c.category === "ready_to_send" || c.category === "skipped_already_sent") {
        delete blockedRegistry[c.candidateId];
      }
    }
    state.blockedRegistry = blockedRegistry;
    await saveRunnerState(state);

    const checkpoint = computeRunnerCheckpoint(store);
    const durationMs = Date.now() - started;
    success = engineResult.ok;
    error = engineResult.stoppedEarly ? engineResult.stopReason : null;

    const finalState = await releaseRunnerLock({
      runId: lock.runId,
      success,
      error,
      durationMs,
      checkpoint,
    });

    await appendRunnerAudit({
      mode,
      runId: lock.runId,
      success,
      durationMs,
      candidateCount: selection.candidateIds.length,
      sendsThisRun: engineResult.sendsThisRun,
      metrics: buildCycleMetrics({
        candidates: engineResult.report.candidates,
        newCandidateIds,
        sendsThisRun: engineResult.sendsThisRun,
        autoRepaired: engineResult.report.metrics.autoRepairedCount,
        breezySyncOk,
      }),
    });

    const metrics = buildCycleMetrics({
      candidates: engineResult.report.candidates,
      newCandidateIds,
      sendsThisRun: engineResult.sendsThisRun,
      autoRepaired: engineResult.report.metrics.autoRepairedCount,
      breezySyncOk,
    });

    const report = buildRunnerReport({
      mode,
      state: finalState,
      metrics,
      candidates: engineResult.report.candidates,
      overlapPrevented: false,
      p106ArtifactPaths: engineResult.report.artifactPaths,
    });

    return { ok: success, skippedOverlap: false, mode, report, warnings };
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    const durationMs = Date.now() - started;
    const finalState = await releaseRunnerLock({
      runId: lock.runId,
      success: false,
      error,
      durationMs,
    });
    await appendRunnerAudit({ mode, runId: lock.runId, success: false, error, durationMs });
    const report = buildRunnerReport({
      mode,
      state: finalState,
      metrics: buildCycleMetrics({
        candidates: [],
        newCandidateIds,
        sendsThisRun: 0,
        autoRepaired: 0,
        breezySyncOk,
      }),
      candidates: [],
      overlapPrevented: false,
      p106ArtifactPaths: {
        p97Audit: ".data/p97-approval-audit.jsonl",
        p97Rollback: ".data/p97-approval-rollback.jsonl",
        p100Audit: ".data/p100-controlled-live-send-audit.jsonl",
      },
    });
    return { ok: false, skippedOverlap: false, mode, report, warnings: [...warnings, error] };
  }
}

export async function startAutonomousPaperworkRunner(input?: {
  intervalMs?: number;
}): Promise<Awaited<ReturnType<typeof loadRunnerState>>> {
  const state = await loadRunnerState();
  state.scheduleEnabled = true;
  state.runnerStatus = "idle";
  if (input?.intervalMs) state.scheduleIntervalMs = input.intervalMs;
  await saveRunnerState(state);
  await appendRunnerAudit({ action: "start", intervalMs: state.scheduleIntervalMs });
  return state;
}

export async function stopAutonomousPaperworkRunner(): Promise<Awaited<ReturnType<typeof loadRunnerState>>> {
  const state = await loadRunnerState();
  state.scheduleEnabled = false;
  state.runnerStatus = state.processingLock ? "running" : "stopped";
  await saveRunnerState(state);
  await appendRunnerAudit({ action: "stop" });
  return state;
}

export async function buildAutonomousPaperworkRunnerSnapshot(): Promise<AutonomousPaperworkRunnerReport> {
  const state = await loadRunnerState();
  return buildRunnerReport({
    mode: P106_1_DEFAULT_MODE,
    state,
    metrics: {
      candidatesEvaluated: 0,
      newCandidates: 0,
      candidatesSent: 0,
      skippedAlreadySent: 0,
      blocked: Object.keys(state.blockedRegistry).length,
      blockedInvalidEmail: Object.values(state.blockedRegistry).filter(
        (b) => b.blockerCategory === "invalid_email",
      ).length,
      blockedDuplicate: Object.values(state.blockedRegistry).filter(
        (b) => b.blockerCategory === "duplicate_risk",
      ).length,
      blockedUnpublishedJob: Object.values(state.blockedRegistry).filter(
        (b) => b.blockerCategory === "unpublished_job",
      ).length,
      blockedClosedJob: Object.values(state.blockedRegistry).filter(
        (b) => b.blockerCategory === "closed_job",
      ).length,
      blockedManualReview: Object.values(state.blockedRegistry).filter(
        (b) =>
          b.blockerCategory === "unknown_manual_review" ||
          b.blockerCategory === "call_first_required",
      ).length,
      autoRepaired: 0,
      breezySyncOk: true,
    },
    candidates: [],
    overlapPrevented: false,
    p106ArtifactPaths: {
      p97Audit: ".data/p97-approval-audit.jsonl",
      p97Rollback: ".data/p97-approval-rollback.jsonl",
      p100Audit: ".data/p100-controlled-live-send-audit.jsonl",
    },
  });
}
