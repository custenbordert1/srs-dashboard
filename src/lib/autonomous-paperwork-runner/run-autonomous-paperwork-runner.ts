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
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import {
  computeRunnerCheckpoint,
  selectCandidatesForRunnerCycle,
  shouldReEvaluateBlockedRecord,
} from "@/lib/autonomous-paperwork-runner/select-candidates-for-runner";
import {
  mapRunnerModeToEngineMode,
  resolveRunnerProductionConfig,
  shouldRunScheduledFullReconciliation,
} from "@/lib/autonomous-paperwork-runner/runner-config";
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

function buildCycleMetrics(input: {
  candidates: AutonomousPaperworkCandidateResult[];
  newCandidateIds: string[];
  sendsThisRun: number;
  autoRepaired: number;
  breezySyncOk: boolean;
  staleEligibleRecovered?: number;
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
    blockedProjectNotMappable: blocked.filter((c) => c.blockerCategory === "project_not_mappable").length,
    blockedMappingReview: blocked.filter((c) => c.blockerCategory === "project_mapping_review").length,
    staleEligibleRecovered: input.staleEligibleRecovered ?? 0,
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
  const prodConfig = resolveRunnerProductionConfig();
  let mode = input?.mode ?? prodConfig.defaultMode;
  if (
    mode === "scheduled" &&
    shouldRunScheduledFullReconciliation({
      lastFullReconciliationAt: (await loadRunnerState()).lastFullReconciliationAt,
      fullReconciliationDaily: prodConfig.fullReconciliationDaily,
    })
  ) {
    mode = "fullReconciliation";
  }
  const mtdOnly = input?.mtdOnly !== false;
  const engineMode = mapRunnerModeToEngineMode({
    mode,
    liveEngineMode: prodConfig.liveEngineMode,
  });
  const warnings: string[] = [
    "P106.3 — no executeBatch; executeOne / executeSafeSingles only when live.",
    "No Breezy writes.",
    `Engine mode: ${engineMode}.`,
    mode === "fullReconciliation"
      ? "fullReconciliation — evaluating all candidates."
      : "Incremental — activity, Paperwork Needed, send-paperwork, blocked registry.",
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
        blockedProjectNotMappable: 0,
        blockedMappingReview: 0,
        staleEligibleRecovered: 0,
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
    const bundle = await getCandidateWorkflowBundle();
    const stateBefore = await loadRunnerState();

    const selection = selectCandidatesForRunnerCycle({
      store,
      workflows: bundle.workflows,
      lastSuccessfulRunAt: stateBefore.lastSuccessfulRunAt,
      lastProcessedCheckpoint: stateBefore.lastProcessedCheckpoint,
      blockedRegistry: stateBefore.blockedRegistry,
      fullReconciliation: mode === "fullReconciliation",
    });
    newCandidateIds = selection.newCandidateIds;
    warnings.push(
      `Stale eligible recovered: ${selection.staleEligibleRecovered}; Paperwork Needed: ${selection.paperworkNeededCount}.`,
    );

    if (selection.candidateIds.length === 0) {
      warnings.push("No candidates selected — skipping engine evaluation.");
      const checkpoint = computeRunnerCheckpoint(store);
      const durationMs = Date.now() - started;
      const finalState = await releaseRunnerLock({
        runId: lock.runId,
        success: true,
        error: null,
        durationMs,
        checkpoint,
      });

      const emptyMetrics = buildCycleMetrics({
        candidates: [],
        newCandidateIds,
        sendsThisRun: 0,
        autoRepaired: 0,
        breezySyncOk,
        staleEligibleRecovered: selection.staleEligibleRecovered,
      });

      await appendRunnerAudit({
        mode,
        runId: lock.runId,
        success: true,
        durationMs,
        candidateCount: 0,
        sendsThisRun: 0,
        metrics: emptyMetrics,
      });

      const report = buildRunnerReport({
        mode,
        state: finalState,
        metrics: emptyMetrics,
        candidates: [],
        overlapPrevented: false,
        p106ArtifactPaths: {
          p97Audit: ".data/p97-approval-audit.jsonl",
          p97Rollback: ".data/p97-approval-rollback.jsonl",
          p100Audit: ".data/p100-controlled-live-send-audit.jsonl",
        },
      });

      return { ok: true, skippedOverlap: false, mode, report, warnings };
    }

    engineResult = await runAutonomousPaperworkEngine({
      mode: engineMode,
      mtdOnly: mode === "fullReconciliation" ? false : mtdOnly,
      candidateIds: selection.candidateIds,
      executiveApprovalFlag: engineMode !== "dryRun",
      approvedBy: "P106.3 Autonomous Paperwork Runner",
      approvedByUserId: input?.byUserId ?? "p1061-runner",
      byUserId: input?.byUserId ?? "p1061-runner",
    });
    warnings.push(...engineResult.warnings);

    const readyIds = engineResult.report.readyToSend.map((c) => c.candidateId);
    if (readyIds.length > 0) {
      warnings.push(`Ready to send this cycle: ${readyIds.length}.`);
    }

    const state = await loadRunnerState();
    const blockedRegistry = { ...state.blockedRegistry };
    for (const c of engineResult.report.candidates) {
      const previous = blockedRegistry[c.candidateId];
      if (c.category === "blocked" && c.blockerCategory) {
        blockedRegistry[c.candidateId] = {
          candidateId: c.candidateId,
          candidateName: c.candidateName,
          blockerCategory: c.blockerCategory,
          blockerReason: c.blockerReason ?? c.blockerCategory,
          recommendedFix: c.recommendedFix,
          lastEvaluatedAt: new Date().toISOString(),
        };
      } else if (
        c.category === "sent" ||
        c.category === "ready_to_send" ||
        c.category === "skipped_already_sent" ||
        (previous &&
          shouldReEvaluateBlockedRecord({
            previous,
            currentBlockerCategory: c.blockerCategory,
            currentCategory: c.category,
          }) &&
          c.category !== "blocked")
      ) {
        delete blockedRegistry[c.candidateId];
      }
    }
    state.blockedRegistry = blockedRegistry;
    if (mode === "fullReconciliation") {
      state.lastFullReconciliationAt = new Date().toISOString();
    }
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
        staleEligibleRecovered: selection.staleEligibleRecovered,
      }),
    });

    const metrics = buildCycleMetrics({
      candidates: engineResult.report.candidates,
      newCandidateIds,
      sendsThisRun: engineResult.sendsThisRun,
      autoRepaired: engineResult.report.metrics.autoRepairedCount,
      breezySyncOk,
      staleEligibleRecovered: selection.staleEligibleRecovered,
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
  explicit?: boolean;
}): Promise<Awaited<ReturnType<typeof loadRunnerState>>> {
  const prodConfig = resolveRunnerProductionConfig();
  if (!input?.explicit && !prodConfig.scheduleEnabled) {
    throw new Error(
      "Schedule not enabled — set AUTONOMOUS_PAPERWORK_RUNNER_SCHEDULE_ENABLED=true or pass explicit start.",
    );
  }
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
      blockedProjectNotMappable: Object.values(state.blockedRegistry).filter(
        (b) => b.blockerCategory === "project_not_mappable",
      ).length,
      blockedMappingReview: Object.values(state.blockedRegistry).filter(
        (b) => b.blockerCategory === "project_mapping_review",
      ).length,
      staleEligibleRecovered: 0,
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
