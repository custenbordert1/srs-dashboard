import type { AuthSession } from "@/lib/auth/types";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { listIngestedMtdCandidates } from "@/lib/candidate-ingestion/mtd-candidates";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { buildDecisionDashboard } from "@/lib/p157-recruiter-decision-engine/build-decision-dashboard";
import { runAutoSendPaperworkReminders } from "@/lib/p145-controlled-paperwork-automation/load-controlled-paperwork-automation";
import { isP146AutoSendEnabled } from "@/lib/recruiting/paperwork-execution-engine";
import {
  isP171LifecycleEnabled,
  isP171PauseActive,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-config";
import { evaluateP171LifecycleGates } from "@/lib/p171-autonomous-candidate-lifecycle-manager/evaluate-lifecycle-gates";
import {
  applyP171Transition,
  createP171CycleId,
  loadP171LifecycleState,
  persistP171CycleResult,
  releaseP171Lock,
  tryAcquireP171Lock,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-store";
import {
  createP171CandidateRecord,
  mapPaperworkToSignatureStatus,
  resolveP171LifecycleState,
  resolveP171StateFromWorkflow,
  shouldSkipP171Candidate,
  summarizeP171Candidates,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/map-lifecycle-state";
import {
  P171_SOURCE_PHASE,
  type P171CandidateLifecycleRecord,
  type P171CycleResult,
  type P171CycleSkipReason,
  type P171LifecycleCycleRecord,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";
import { executeP159OperationsControl } from "@/lib/p159-operations-control-center/execute-control-action";
import type { P1547CycleReport } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";
import { runPaperworkMonitorCycle } from "@/lib/paperwork-monitor/run-paperwork-monitor-cycle";

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

function computeAverageCompletionMs(records: P171CandidateLifecycleRecord[]): number | null {
  const completed = records.filter((r) => r.readyForMelAt && r.discoveredAt);
  if (completed.length === 0) return null;
  const total = completed.reduce(
    (sum, r) => sum + (Date.parse(r.readyForMelAt!) - Date.parse(r.discoveredAt!)),
    0,
  );
  return Math.round(total / completed.length);
}

async function discoverAndEvaluate(input: {
  cycleId: string;
  minimumConfidence: number;
  estimatedNextRun: string;
  existing: Record<string, P171CandidateLifecycleRecord>;
}): Promise<{
  records: Record<string, P171CandidateLifecycleRecord>;
  discovered: number;
  evaluated: number;
  skipped: number;
  discoveryLatencyMs: number;
  evaluationLatencyMs: number;
}> {
  const discoveryStart = Date.now();
  const store = await readIngestionStore();
  const mtdCandidates = listIngestedMtdCandidates(store);
  const discoveryLatencyMs = Date.now() - discoveryStart;

  const evaluationStart = Date.now();
  const [dashboard, workflows] = await Promise.all([
    buildDecisionDashboard(),
    getCandidateWorkflowState(),
  ]);
  const evaluationLatencyMs = Date.now() - evaluationStart;

  const records: Record<string, P171CandidateLifecycleRecord> = { ...input.existing };
  let discovered = 0;
  let evaluated = 0;
  let skipped = 0;

  const decisionById = new Map(dashboard.decisions.map((d) => [d.candidateId, d]));
  const mtdIds = new Set(mtdCandidates.map((c) => c.candidateId));

  for (const decision of dashboard.decisions) {
    if (!mtdIds.has(decision.candidateId)) continue;
    evaluated += 1;

    const existing = records[decision.candidateId] ?? null;

    if (shouldSkipP171Candidate(existing, input.cycleId)) {
      skipped += 1;
      continue;
    }

    const workflow = workflows[decision.candidateId] ?? null;
    const resolved = resolveP171LifecycleState({
      decision,
      workflow,
      minimumConfidence: input.minimumConfidence,
      estimatedNextRun: input.estimatedNextRun,
    });

    if (!existing) {
      discovered += 1;
      const created = createP171CandidateRecord({
        decision,
        workflow,
        minimumConfidence: input.minimumConfidence,
        estimatedNextRun: input.estimatedNextRun,
      });
      records[decision.candidateId] = applyP171Transition({
        record: created,
        to: resolved.state,
        cycleId: input.cycleId,
        reason: `Initial lifecycle state: ${resolved.state}`,
        source: "discovery",
      });
      continue;
    }

    if (existing.state !== resolved.state) {
      records[decision.candidateId] = applyP171Transition({
        record: {
          ...existing,
          confidence: decision.confidence,
          p157Action: decision.action,
          signatureStatus: resolved.signatureStatus,
          exceptionCategory: resolved.exceptionCategory,
          exceptionReason: resolved.exceptionReason,
        },
        to: resolved.state,
        cycleId: input.cycleId,
        reason: `P157 ${decision.action} → ${resolved.state}`,
        source: "evaluation",
      });
    } else {
      records[decision.candidateId] = {
        ...existing,
        confidence: decision.confidence,
        p157Action: decision.action,
        signatureStatus: resolved.signatureStatus,
        lastProcessedCycleId: input.cycleId,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  // Discover candidates in MTD not yet in decisions (ingestion-only)
  for (const candidate of mtdCandidates) {
    if (records[candidate.candidateId] || !decisionById.has(candidate.candidateId)) {
      if (!records[candidate.candidateId] && !decisionById.has(candidate.candidateId)) {
        discovered += 1;
        const now = new Date().toISOString();
        records[candidate.candidateId] = {
          candidateId: candidate.candidateId,
          candidateName: `${candidate.firstName} ${candidate.lastName}`.trim() || candidate.email,
          email: candidate.email || null,
          position: candidate.positionName || candidate.positionId,
          state: "DISCOVERED",
          signatureStatus: "NOT_SENT",
          exceptionCategory: null,
          exceptionReason: null,
          exceptionResolvedAt: null,
          confidence: null,
          p157Action: null,
          reminderCount: 0,
          lastReminderAt: null,
          discoveredAt: now,
          evaluatedAt: null,
          paperworkSentAt: null,
          signedAt: null,
          readyForMelAt: null,
          lastProcessedCycleId: input.cycleId,
          transitions: [],
          updatedAt: now,
        };
      }
    }
  }

  return { records, discovered, evaluated, skipped, discoveryLatencyMs, evaluationLatencyMs };
}

function buildSkippedCycle(input: {
  cycleId: string;
  startedAt: string;
  skipReason: P171CycleSkipReason;
  skipReasons: string[];
  gateBlockingFactors: string[];
  gates: Awaited<ReturnType<typeof evaluateP171LifecycleGates>>;
  discovered: number;
  evaluated: number;
  skipped: number;
  discoveryLatencyMs: number;
  evaluationLatencyMs: number;
}): P171LifecycleCycleRecord {
  const completedAt = new Date().toISOString();
  return {
    cycleId: input.cycleId,
    sourcePhase: P171_SOURCE_PHASE,
    startedAt: input.startedAt,
    completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(input.startedAt),
    status: "skipped",
    skipReason: input.skipReason,
    candidatesDiscovered: input.discovered,
    candidatesEvaluated: input.evaluated,
    candidatesProcessed: 0,
    candidatesSkipped: input.skipped,
    paperworkSent: 0,
    remindersSent: 0,
    signaturesSynced: 0,
    readyForMel: 0,
    waitingSignature: 0,
    exceptionsCreated: 0,
    exceptionsResolved: 0,
    recruiterInterventionsSaved: 0,
    automationSuccessRate: 0,
    exceptionRate: 0,
    discoveryLatencyMs: input.discoveryLatencyMs,
    evaluationLatencyMs: input.evaluationLatencyMs,
    paperworkLatencyMs: null,
    signatureLatencyMs: null,
    averageCompletionTimeMs: null,
    executedLiveCycle: false,
    executedSignatureMonitor: false,
    executedReminders: false,
    gateBlockingFactors: input.gateBlockingFactors,
    skipReasons: input.skipReasons,
    healthScore: input.gates.healthScore,
  };
}

export async function runP171LifecycleCycle(input: {
  session: AuthSession;
  force?: boolean;
}): Promise<P171CycleResult> {
  const startedAt = new Date().toISOString();
  const cycleId = createP171CycleId();
  const warnings: string[] = [];
  const state = await loadP171LifecycleState();
  const config = state.config;
  const estimatedNextRun = new Date(Date.now() + config.cycleIntervalMs).toISOString();

  const gates = await evaluateP171LifecycleGates(config);

  const discovery = await discoverAndEvaluate({
    cycleId,
    minimumConfidence: config.minimumConfidence,
    estimatedNextRun,
    existing: state.candidates,
  });

  const finishSkipped = async (
    skipReason: P171CycleSkipReason,
    skipReasons: string[],
    gateBlockingFactors: string[] = gates.blockingFactors,
  ): Promise<P171CycleResult> => {
    const record = buildSkippedCycle({
      cycleId,
      startedAt,
      skipReason,
      skipReasons,
      gateBlockingFactors,
      gates,
      discovered: discovery.discovered,
      evaluated: discovery.evaluated,
      skipped: discovery.skipped,
      discoveryLatencyMs: discovery.discoveryLatencyMs,
      evaluationLatencyMs: discovery.evaluationLatencyMs,
    });
    await persistP171CycleResult({
      record,
      candidates: discovery.records,
      consecutiveFailures: state.consecutiveFailures,
      executiveAlertRaised: false,
    });
    return { ok: true, cycle: record, warnings };
  };

  if (!isP171LifecycleEnabled() && !input.force) {
    return finishSkipped("lifecycle_disabled", ["P171_LIFECYCLE_ENABLED is not true"]);
  }

  const pauseReason = isP171PauseActive(config);
  if (pauseReason && !input.force) {
    return finishSkipped("lifecycle_paused", [pauseReason]);
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
    warnings.push("Consecutive failure threshold reached — lifecycle manager auto-paused");
    return finishSkipped("consecutive_failures", [
      `${state.consecutiveFailures} consecutive failures (max ${config.maximumRetries})`,
    ]);
  }

  const acquired = await tryAcquireP171Lock(cycleId);
  if (!acquired) {
    return finishSkipped("processing_lock", ["Another lifecycle cycle is in progress"]);
  }

  try {
    if (!gates.pass && !input.force) {
      const skipReason: P171CycleSkipReason =
        gates.approvalAction !== "RUN_NEXT_BATCH"
          ? "approval_not_run_next_batch"
          : gates.schedulerRecommendation !== "READY_NOW"
            ? "scheduler_wait"
            : "safety_gates_failed";
      return finishSkipped(skipReason, gates.blockingFactors);
    }

    const approvedIds = Object.values(discovery.records)
      .filter((r) => r.state === "APPROVED")
      .map((r) => r.candidateId);

    const cycleStart = Date.now();
    let paperworkSent = 0;
    let remindersSent = 0;
    let signaturesSynced = 0;
    let executedLiveCycle = false;
    let executedSignatureMonitor = false;
    let executedReminders = false;
    let paperworkLatencyMs: number | null = null;
    let signatureLatencyMs: number | null = null;
    const skipReasons: string[] = [];

    // Delegate paperwork sends through P159 → P154 → P152 (no duplicate send logic)
    if (approvedIds.length > 0) {
      const sendStart = Date.now();
      const result = await executeP159OperationsControl({
        session: input.session,
        action: "live_cycle",
        confirmLive: true,
      });
      paperworkLatencyMs = Date.now() - sendStart;
      executedLiveCycle = !result.dryRun;
      const cycleReport = result.cycleReport as P1547CycleReport | undefined;
      paperworkSent = cycleReport?.metrics.sent ?? 0;
      if (!result.ok) skipReasons.push(result.message);

      // Transition approved candidates to PAPERWORK_SENT when live cycle executed
      if (paperworkSent > 0) {
        for (const id of approvedIds) {
          const record = discovery.records[id];
          if (!record) continue;
          discovery.records[id] = applyP171Transition({
            record,
            to: "PAPERWORK_SENT",
            cycleId,
            reason: "Paperwork sent via P159 → P154 → P152",
            source: "orchestrator",
          });
        }
      }
    }

    // Signature monitoring via P107 (reuse existing Dropbox sync)
    const waitingIds = Object.values(discovery.records)
      .filter((r) => r.state === "PAPERWORK_SENT" || r.state === "WAITING_SIGNATURE")
      .map((r) => r.candidateId);

    if (waitingIds.length > 0) {
      const sigStart = Date.now();
      const monitor = await runPaperworkMonitorCycle({
        mode: "runOnce",
        monitorScope: "postCycle",
        priorityCandidateIds: waitingIds,
        byUserId: input.session.userId,
      });
      signatureLatencyMs = Date.now() - sigStart;
      executedSignatureMonitor = true;
      signaturesSynced = monitor.report.metrics.syncedThisCycle ?? 0;

      // Re-evaluate signature states from workflow store
      const workflows = await getCandidateWorkflowState();
      for (const id of waitingIds) {
        const record = discovery.records[id];
        if (!record) continue;
        const workflow = workflows[id] ?? null;
        const nextState = resolveP171StateFromWorkflow(workflow);
        if (!nextState || record.state === nextState) continue;
        discovery.records[id] = applyP171Transition({
          record: {
            ...record,
            signatureStatus: mapPaperworkToSignatureStatus(workflow?.paperworkStatus),
          },
          to: nextState,
          cycleId,
          reason: `Signature monitor: ${workflow?.paperworkStatus ?? "updated"}`,
          source: "signature_monitor",
        });
      }
    }

    // Reminder engine via P146 (stop after signature — handled by P146 eligibility)
    if (isP146AutoSendEnabled() || input.force) {
      const reminderResult = await runAutoSendPaperworkReminders({
        session: input.session,
        dryRun: !isP146AutoSendEnabled(),
      });
      executedReminders = true;
      remindersSent = reminderResult.summary.sentCount ?? 0;
    }

    const summary = summarizeP171Candidates(Object.values(discovery.records));
    const completedAt = new Date().toISOString();
    const success = skipReasons.length === 0 || paperworkSent > 0 || signaturesSynced > 0;

    const record: P171LifecycleCycleRecord = {
      cycleId,
      sourcePhase: P171_SOURCE_PHASE,
      startedAt,
      completedAt,
      durationMs: Date.parse(completedAt) - cycleStart,
      status: success ? "success" : paperworkSent > 0 ? "partial" : "failed",
      skipReason: null,
      candidatesDiscovered: discovery.discovered,
      candidatesEvaluated: discovery.evaluated,
      candidatesProcessed: summary.total - discovery.skipped,
      candidatesSkipped: discovery.skipped,
      paperworkSent,
      remindersSent,
      signaturesSynced,
      readyForMel: summary.readyForMel,
      waitingSignature: summary.waitingSignature,
      exceptionsCreated: summary.exceptions,
      exceptionsResolved: 0,
      recruiterInterventionsSaved: summary.recruiterInterventionsSaved,
      automationSuccessRate: summary.automationPercent,
      exceptionRate: summary.exceptionPercent,
      discoveryLatencyMs: discovery.discoveryLatencyMs,
      evaluationLatencyMs: discovery.evaluationLatencyMs,
      paperworkLatencyMs,
      signatureLatencyMs,
      averageCompletionTimeMs: computeAverageCompletionMs(Object.values(discovery.records)),
      executedLiveCycle,
      executedSignatureMonitor,
      executedReminders,
      gateBlockingFactors: [],
      skipReasons,
      healthScore: gates.healthScore,
    };

    const nextFailures = success ? 0 : state.consecutiveFailures + 1;
    const executiveAlertRaised = nextFailures >= config.maximumRetries;

    await persistP171CycleResult({
      record,
      candidates: discovery.records,
      consecutiveFailures: nextFailures,
      executiveAlertRaised,
    });

    if (!success) warnings.push(...skipReasons);
    if (executiveAlertRaised) {
      warnings.push("Executive alert: lifecycle manager paused after repeated failures");
    }

    return { ok: success, cycle: record, warnings };
  } finally {
    await releaseP171Lock();
  }
}
