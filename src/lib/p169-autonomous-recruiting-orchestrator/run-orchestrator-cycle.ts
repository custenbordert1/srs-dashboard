import type { AuthSession } from "@/lib/auth/types";
import { getDropboxSignApiMetricsSnapshot } from "@/lib/dropbox-sign-api";
import { buildDecisionDashboard } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import {
  isPauseScheduleActive,
  isP169OrchestratorEnabled,
  isWithinMaintenanceWindow,
} from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import { evaluateP169CycleGates } from "@/lib/p169-autonomous-recruiting-orchestrator/evaluate-cycle-gates";
import {
  mapP157ToP169Outcome,
  summarizeP169Evaluations,
} from "@/lib/p169-autonomous-recruiting-orchestrator/map-candidate-outcome";
import {
  createP169CycleId,
  loadP169OrchestratorState,
  persistP169CycleResult,
  releaseP169Lock,
  tryAcquireP169Lock,
} from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-store";
import {
  P169_SOURCE_PHASE,
  type P169CandidateEvaluation,
  type P169CycleResult,
  type P169CycleSkipReason,
  type P169OrchestratorCycleRecord,
} from "@/lib/p169-autonomous-recruiting-orchestrator/types";
import { executeP159OperationsControl } from "@/lib/p159-operations-control-center/execute-control-action";
import type { P1547CycleReport } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

const TWO_MIN_MS = 2 * 60_000;

function agoLabel(iso: string | null): string {
  if (!iso) return "never";
  const delta = Date.now() - Date.parse(iso);
  if (delta < 60_000) return "just now";
  const min = Math.round(delta / 60_000);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  return `${hr} hour${hr === 1 ? "" : "s"} ago`;
}

async function evaluateCandidates(
  estimatedNextRun: string | null,
  minimumConfidence: number,
): Promise<P169CandidateEvaluation[]> {
  const dashboard = await buildDecisionDashboard();
  return dashboard.decisions.map((decision) =>
    mapP157ToP169Outcome(decision, minimumConfidence, estimatedNextRun),
  );
}

function buildSkippedCycle(input: {
  cycleId: string;
  startedAt: string;
  skipReason: P169CycleSkipReason;
  skipReasons: string[];
  gateBlockingFactors: string[];
  evaluations: P169CandidateEvaluation[];
  gates: Awaited<ReturnType<typeof evaluateP169CycleGates>>;
}): P169OrchestratorCycleRecord {
  const summary = summarizeP169Evaluations(input.evaluations);
  const completedAt = new Date().toISOString();
  return {
    cycleId: input.cycleId,
    sourcePhase: P169_SOURCE_PHASE,
    startedAt: input.startedAt,
    completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(input.startedAt),
    status: "skipped",
    skipReason: input.skipReason,
    candidatesEvaluated: summary.candidatesEvaluated,
    candidatesSent: 0,
    candidatesSkipped: summary.skipped,
    exceptionsCreated: summary.exceptionsCreated,
    readyForMel: summary.readyForMel,
    waitingSignature: summary.waitingSignature,
    autoSendEligible: summary.autoSendEligible,
    dropboxRequests: null,
    averageSendTimeMs: null,
    failures: 0,
    retries: 0,
    skipReasons: input.skipReasons,
    gateBlockingFactors: input.gateBlockingFactors,
    executedLiveCycle: false,
    paperworkSent: null,
    healthScore: input.gates.healthScore,
    schedulerRecommendation: input.gates.schedulerRecommendation,
    runnerStatus: input.gates.runnerStatus,
  };
}

export async function runP169OrchestratorCycle(input: {
  session: AuthSession;
  force?: boolean;
}): Promise<P169CycleResult> {
  const startedAt = new Date().toISOString();
  const cycleId = createP169CycleId();
  const warnings: string[] = [];
  const state = await loadP169OrchestratorState();
  const config = state.config;
  const estimatedNextRun = new Date(Date.now() + config.cycleIntervalMs).toISOString();

  const evaluations = await evaluateCandidates(estimatedNextRun, config.minimumConfidence);
  const gates = await evaluateP169CycleGates(config);

  const finishSkipped = async (
    skipReason: P169CycleSkipReason,
    skipReasons: string[],
    gateBlockingFactors: string[] = gates.blockingFactors,
  ): Promise<P169CycleResult> => {
    const record = buildSkippedCycle({
      cycleId,
      startedAt,
      skipReason,
      skipReasons,
      gateBlockingFactors,
      evaluations,
      gates,
    });
    await persistP169CycleResult({
      record,
      evaluations,
      consecutiveFailures: state.consecutiveFailures,
      executiveAlertRaised: false,
    });
    return { ok: true, cycle: record, evaluations, warnings };
  };

  if (!isP169OrchestratorEnabled() && !input.force) {
    return finishSkipped("orchestrator_disabled", ["P169_ORCHESTRATOR_ENABLED is not true"]);
  }

  const pauseReason = isPauseScheduleActive(config);
  if (pauseReason && !input.force) {
    return finishSkipped("orchestrator_paused", [pauseReason]);
  }

  if (isWithinMaintenanceWindow(config) && !input.force) {
    return finishSkipped("maintenance_window", ["Active maintenance window"]);
  }

  if (
    state.lastCycleAt &&
    Date.now() - Date.parse(state.lastCycleAt) < TWO_MIN_MS &&
    !input.force
  ) {
    return finishSkipped("minimum_interval", [
      `Last cycle ${agoLabel(state.lastCycleAt)} — minimum wait not satisfied`,
    ]);
  }

  if (state.consecutiveFailures >= config.maximumRetries && !input.force) {
    warnings.push("Consecutive failure threshold reached — orchestrator auto-paused");
    return finishSkipped("consecutive_failures", [
      `${state.consecutiveFailures} consecutive failures (max ${config.maximumRetries})`,
    ]);
  }

  const acquired = await tryAcquireP169Lock(cycleId);
  if (!acquired) {
    return finishSkipped("processing_lock", ["Another orchestrator cycle is in progress"]);
  }

  try {
    if (!gates.pass && !input.force) {
      const skipReason: P169CycleSkipReason =
        gates.approvalAction !== "RUN_NEXT_BATCH"
          ? "approval_not_run_next_batch"
          : gates.schedulerRecommendation !== "READY_NOW"
            ? "scheduler_wait"
            : "safety_gates_failed";
      return finishSkipped(skipReason, gates.blockingFactors);
    }

    const dropboxBefore = getDropboxSignApiMetricsSnapshot().totalRequests;
    const cycleStart = Date.now();

    const result = await executeP159OperationsControl({
      session: input.session,
      action: "live_cycle",
      confirmLive: true,
    });

    const dropboxAfter = getDropboxSignApiMetricsSnapshot().totalRequests;
    const dropboxRequests = dropboxAfter - dropboxBefore;
    const summary = summarizeP169Evaluations(evaluations);
    const completedAt = new Date().toISOString();
    const cycleReport = result.cycleReport as P1547CycleReport | undefined;
    const paperworkSent = cycleReport?.metrics.sent ?? 0;
    const failures = cycleReport?.metrics.errors ?? 0;
    const success = result.ok && failures === 0;

    const record: P169OrchestratorCycleRecord = {
      cycleId,
      sourcePhase: P169_SOURCE_PHASE,
      startedAt,
      completedAt,
      durationMs: Date.parse(completedAt) - cycleStart,
      status: success ? "success" : paperworkSent > 0 ? "partial" : "failed",
      skipReason: null,
      candidatesEvaluated: summary.candidatesEvaluated,
      candidatesSent: paperworkSent,
      candidatesSkipped: summary.skipped,
      exceptionsCreated: summary.exceptionsCreated,
      readyForMel: summary.readyForMel,
      waitingSignature: summary.waitingSignature,
      autoSendEligible: summary.autoSendEligible,
      dropboxRequests,
      averageSendTimeMs:
        paperworkSent > 0 ? Math.round((Date.parse(completedAt) - cycleStart) / paperworkSent) : null,
      failures,
      retries: state.consecutiveFailures,
      skipReasons: success ? [] : [result.message],
      gateBlockingFactors: [],
      executedLiveCycle: !result.dryRun,
      paperworkSent,
      healthScore: gates.healthScore,
      schedulerRecommendation: gates.schedulerRecommendation,
      runnerStatus: gates.runnerStatus,
    };

    const nextFailures = success ? 0 : state.consecutiveFailures + 1;
    const executiveAlertRaised = nextFailures >= config.maximumRetries;

    await persistP169CycleResult({
      record,
      evaluations,
      consecutiveFailures: nextFailures,
      executiveAlertRaised,
    });

    if (!success) {
      warnings.push(result.message);
    }
    if (executiveAlertRaised) {
      warnings.push("Executive alert: autonomous orchestrator paused after repeated failures");
    }

    return { ok: success, cycle: record, evaluations, warnings };
  } finally {
    await releaseP169Lock();
  }
}
