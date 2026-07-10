import { randomUUID } from "node:crypto";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { readDropboxSignConfig } from "@/lib/dropbox-sign";
import {
  runP184AutonomousPaperworkSendEngine,
  type P184SenderDeps,
} from "@/lib/p184-autonomous-paperwork-send-engine";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { loadLiveP185Candidates } from "@/lib/p185-production-paperwork-automation-runner/candidateSource";
import {
  getP185StorageHealth,
  loadP185RunnerState,
  saveP185RunnerState,
} from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import {
  isP185SchedulerAuthConfigured,
} from "@/lib/p185-production-paperwork-automation-runner/health";
import {
  acquireP185Lease,
  releaseP185Lease,
} from "@/lib/p185-production-paperwork-automation-runner/lease";
import { buildP185Metrics } from "@/lib/p185-production-paperwork-automation-runner/metrics";
import {
  reconcileP185Envelopes,
  recordP185SendUnverified,
} from "@/lib/p185-production-paperwork-automation-runner/reconciliation";
import {
  evaluateP185Alerts,
  evaluateP185LiveGates,
  openP185CircuitBreaker,
  pushAlert,
  recordCycleFailure,
} from "@/lib/p185-production-paperwork-automation-runner/safety";
import type {
  P185CycleSummary,
  P185RunnerStateFile,
} from "@/lib/p185-production-paperwork-automation-runner/types";

export type P185RunOptions = {
  /** Forced intent for this invocation — never trusted from HTTP for live without gates. */
  intent?: "scheduled" | "dry_run" | "live" | "reconcile_only" | "health";
  maxCandidates?: number;
  maxSends?: number;
  ownerId?: string;
  nowMs?: number;
  deadlineMs?: number;
  byUserId?: string;
  skipLease?: boolean;
  deps?: {
    loadCandidates?: typeof loadLiveP185Candidates;
    runP184?: typeof runP184AutonomousPaperworkSendEngine;
    reconcile?: typeof reconcileP185Envelopes;
    senderDeps?: P184SenderDeps;
  };
};

export type P185RunResult = {
  ok: boolean;
  skipped: boolean;
  skipReason: string | null;
  cycle: P185CycleSummary | null;
  healthHints: string[];
  lease: {
    ownerId: string | null;
    remainingMs: number | null;
  };
  reconciliation: Awaited<ReturnType<typeof reconcileP185Envelopes>> | null;
  p184: Awaited<ReturnType<typeof runP184AutonomousPaperworkSendEngine>> | null;
  storageDurable: boolean;
  mode: "dry_run" | "live";
};

function nextScheduledAt(state: P185RunnerStateFile, nowMs: number): string {
  return new Date(nowMs + state.safety.expectedCycleIntervalMs).toISOString();
}

function emptyCycle(
  cycleId: string,
  nowMs: number,
  mode: "dry_run" | "live",
  skipped: boolean,
  skipReason: string | null,
  storageDurable: boolean,
  leaseOwnerId: string | null,
): P185CycleSummary {
  return {
    cycleId,
    startedAt: new Date(nowMs).toISOString(),
    finishedAt: new Date(nowMs).toISOString(),
    mode,
    skipped,
    skipReason,
    evaluated: 0,
    eligible: 0,
    sent: 0,
    confirmed: 0,
    failed: 0,
    retriesDue: 0,
    rateLimited: false,
    durationMs: 0,
    storageDurable,
    leaseOwnerId,
    warnings: skipReason ? [skipReason] : [],
  };
}

export async function runP185ProductionPaperworkAutomation(
  options: P185RunOptions = {},
): Promise<P185RunResult> {
  const started = options.nowMs ?? Date.now();
  const nowMs = started;
  const cycleId = randomUUID();
  const ownerId = options.ownerId ?? `p185-${cycleId.slice(0, 8)}`;
  const storage = getP185StorageHealth();
  const state0 = await loadP185RunnerState();
  const deadlineMs =
    options.deadlineMs ?? nowMs + (state0.safety.executionBudgetMs || 50_000);
  const claimCutoffMs = state0.safety.claimCutoffMs || 10_000;

  if (options.intent === "health") {
    return {
      ok: true,
      skipped: true,
      skipReason: "health_only",
      cycle: null,
      healthHints: [],
      lease: { ownerId: state0.lease?.ownerId ?? null, remainingMs: null },
      reconciliation: null,
      p184: null,
      storageDurable: storage.durable,
      mode: "dry_run",
    };
  }

  if (options.intent === "reconcile_only") {
    const reconciliation = await (options.deps?.reconcile ?? reconcileP185Envelopes)({
      nowMs,
    });
    return {
      ok: true,
      skipped: false,
      skipReason: null,
      cycle: null,
      healthHints: [`Reconciled ${reconciliation.checked} envelopes.`],
      lease: { ownerId: null, remainingMs: null },
      reconciliation,
      p184: null,
      storageDurable: storage.durable,
      mode: "dry_run",
    };
  }

  // Kill switch / pause — no sends
  if (state0.safety.killSwitch) {
    const cycle = emptyCycle(
      cycleId,
      nowMs,
      "dry_run",
      true,
      "Kill switch active.",
      storage.durable,
      null,
    );
    await persistSkipped(state0, cycle, nowMs);
    return skippedResult(cycle, storage.durable);
  }
  if (state0.safety.pauseUntil && Date.parse(state0.safety.pauseUntil) > nowMs) {
    const cycle = emptyCycle(
      cycleId,
      nowMs,
      "dry_run",
      true,
      `Paused until ${state0.safety.pauseUntil}.`,
      storage.durable,
      null,
    );
    await persistSkipped(state0, cycle, nowMs);
    return skippedResult(cycle, storage.durable);
  }
  if (state0.circuit.open) {
    const cooldownOk =
      state0.circuit.cooldownUntil && Date.parse(state0.circuit.cooldownUntil) <= nowMs;
    if (!cooldownOk) {
      const cycle = emptyCycle(
        cycleId,
        nowMs,
        "dry_run",
        true,
        state0.circuit.reason ?? "Circuit breaker open.",
        storage.durable,
        null,
      );
      await persistSkipped(state0, cycle, nowMs);
      return skippedResult(cycle, storage.durable);
    }
  }

  let leaseOwner: string | null = null;
  let leaseCycleId: string | null = null;

  try {
    if (!options.skipLease) {
      const lease = await acquireP185Lease({
        ownerId,
        cycleId,
        nowMs,
        ttlMs: state0.safety.leaseTtlMs,
      });
      if (!lease.acquired) {
        const cycle = emptyCycle(
          cycleId,
          nowMs,
          "dry_run",
          true,
          lease.reason,
          storage.durable,
          lease.activeLease?.ownerId ?? null,
        );
        cycle.warnings.push(
          `Active lease owner=${lease.activeLease?.ownerId ?? "unknown"}; remainingMs=${lease.remainingMs}`,
        );
        const state = await loadP185RunnerState();
        state.skippedCycles += 1;
        state.lastAttemptedCycle = cycle;
        state.nextScheduledRunAt = nextScheduledAt(state, nowMs);
        await saveP185RunnerState(state);
        return {
          ok: true,
          skipped: true,
          skipReason: lease.reason,
          cycle,
          healthHints: cycle.warnings,
          lease: {
            ownerId: lease.activeLease?.ownerId ?? null,
            remainingMs: lease.remainingMs,
          },
          reconciliation: null,
          p184: null,
          storageDurable: storage.durable,
          mode: "dry_run",
        };
      }
      leaseOwner = lease.lease.ownerId;
      leaseCycleId = lease.lease.cycleId;
    }

    // Stop claiming new work near deadline
    if (Date.now() > deadlineMs - claimCutoffMs && options.nowMs == null) {
      const cycle = emptyCycle(
        cycleId,
        nowMs,
        "dry_run",
        true,
        "Execution deadline — stopped before claiming work.",
        storage.durable,
        leaseOwner,
      );
      await persistSkipped(await loadP185RunnerState(), cycle, nowMs);
      return skippedResult(cycle, storage.durable, leaseOwner);
    }

    const state = await loadP185RunnerState();
    const p184State = await loadP184EngineState();
    const authConfigured = isP185SchedulerAuthConfigured();
    const dropboxConfigured = Boolean(readDropboxSignConfig());

    // Mode is NEVER taken from the request for scheduled runs.
    // Intent dry_run forces dry_run; intent live still requires all gates.
    let mode: "dry_run" | "live" = "dry_run";
    if (options.intent === "live" || options.intent === "scheduled") {
      const gates = evaluateP185LiveGates({
        state,
        p184Config: p184State.config,
        storage,
        dropboxConfigured,
        authConfigured,
        nowMs,
      });
      if (options.intent === "live" && gates.ready) {
        mode = "live";
      } else if (
        options.intent === "scheduled" &&
        gates.ready &&
        p184State.config.mode === "live" &&
        p184State.config.enabled
      ) {
        mode = "live";
      } else if (options.intent === "live" && !gates.ready) {
        const cycle = emptyCycle(
          cycleId,
          nowMs,
          "dry_run",
          true,
          `Live blocked: ${gates.blockers.join(" ")}`,
          storage.durable,
          leaseOwner,
        );
        cycle.warnings.push(...gates.blockers);
        await persistSkipped(state, cycle, nowMs);
        return skippedResult(cycle, storage.durable, leaseOwner);
      }
    }

    // Live fails closed without durable storage
    if (mode === "live" && (!storage.durable || !storage.healthy)) {
      const cycle = emptyCycle(
        cycleId,
        nowMs,
        "dry_run",
        true,
        "Live sends fail closed — durable storage unavailable.",
        false,
        leaseOwner,
      );
      pushAlert(state, {
        id: `storage-fail-${nowMs}`,
        severity: "critical",
        code: "durable_storage_unavailable",
        message: storage.detail,
        recommendedAction: "Configure durable volume before live automation.",
        at: new Date(nowMs).toISOString(),
        active: true,
      });
      await persistSkipped(state, cycle, nowMs);
      return {
        ...skippedResult(cycle, false, leaseOwner),
        healthHints: [storage.detail, "Dry-run may continue in degraded mode on next intent=dry_run."],
      };
    }

    if (!storage.healthy && mode === "dry_run") {
      state.runnerStatus = "degraded";
      pushAlert(state, {
        id: `storage-degraded-${nowMs}`,
        severity: "warning",
        code: "durable_storage_unavailable",
        message: `Dry-run degraded: ${storage.detail}`,
        recommendedAction: "Fix storage before enabling live.",
        at: new Date(nowMs).toISOString(),
        active: true,
      });
      await saveP185RunnerState(state);
    }

    const maxCandidates =
      options.maxCandidates ?? state.safety.maxCandidatesPerCycle ?? 200;
    const maxSends = Math.min(
      options.maxSends ?? state.safety.maxSendsPerCycle ?? 10,
      p184State.config.maxSendsPerCycle,
    );

    const loadCandidates = options.deps?.loadCandidates ?? loadLiveP185Candidates;
    const source = await loadCandidates({
      cursor: state.cursor,
      maxCandidates,
      fullReconciliationIntervalMs: state.safety.fullReconciliationIntervalMs,
      nowMs,
    });

    state.cursor = source.cursor;

    // Always reconcile unresolved envelopes (never resends)
    const reconciliation = await (options.deps?.reconcile ?? reconcileP185Envelopes)({
      nowMs,
      deps: options.deps?.senderDeps
        ? undefined
        : undefined,
    });

    if (Date.now() > deadlineMs - claimCutoffMs && options.nowMs == null) {
      const cycle = emptyCycle(
        cycleId,
        nowMs,
        mode,
        true,
        "Stopped before P184 cycle — execution budget exhausted.",
        storage.durable,
        leaseOwner,
      );
      state.cursor = source.cursor;
      await persistSkipped(state, cycle, nowMs);
      return {
        ...skippedResult(cycle, storage.durable, leaseOwner),
        reconciliation,
      };
    }

    const runP184 = options.deps?.runP184 ?? runP184AutonomousPaperworkSendEngine;
    const p184 = await runP184({
      candidates: source.candidates,
      onboardingByCandidateId: source.onboardingByCandidateId,
      jobsByPositionId: source.jobsByPositionId,
      mode,
      maxSends,
      byUserId: options.byUserId ?? "p185-production-runner",
      deps: options.deps?.senderDeps,
      nowMs,
    });

    // Persist unverified envelopes for live sends
    let confirmed = 0;
    let failed = p184.failed;
    for (const result of p184.results) {
      if (result.ok && result.envelopeId && !result.simulated) {
        await recordP185SendUnverified({
          candidateId: result.candidateId,
          envelopeId: result.envelopeId,
          idempotencyKey: result.idempotencyKey,
          nowMs,
        });
      }
      if (result.ok && result.simulated) confirmed += 1;
    }

    // Immediate verification pass for new envelopes
    const verify = await (options.deps?.reconcile ?? reconcileP185Envelopes)({ nowMs });
    confirmed += verify.confirmed;

    const finished = options.nowMs != null ? nowMs + 1 : Date.now();
    const cycle: P185CycleSummary = {
      cycleId,
      startedAt: new Date(nowMs).toISOString(),
      finishedAt: new Date(finished).toISOString(),
      mode,
      skipped: false,
      skipReason: null,
      evaluated: p184.evaluated,
      eligible: p184.eligible,
      sent: p184.sent,
      confirmed,
      failed,
      retriesDue: p184.retriesScheduled,
      rateLimited: p184.rateLimited,
      durationMs: finished - nowMs,
      storageDurable: storage.durable,
      leaseOwnerId: leaseOwner,
      warnings: [
        ...(!source.sourceHealthy ? [source.sourceDetail] : []),
        ...(!storage.healthy ? [`Storage degraded: ${storage.detail}`] : []),
      ],
    };

    const latest = await loadP185RunnerState();
    latest.cursor = source.cursor;
    latest.lastAttemptedCycle = cycle;
    if (!cycle.skipped && failed < latest.safety.maxFailuresPerCycle) {
      latest.lastSuccessfulCycle = cycle;
      if (mode === "dry_run") latest.lastDryRunSuccessAt = cycle.finishedAt;
      if (mode === "live" && p184.sent > 0) latest.lastLiveSendAt = cycle.finishedAt;
      latest.circuit.failureCount = 0;
    }
    if (failed >= latest.safety.maxFailuresPerCycle) {
      openP185CircuitBreaker(
        latest,
        `Max failures per cycle reached (${failed}).`,
        finished,
      );
    } else if (p184.failed > 0) {
      recordCycleFailure(latest, finished);
    }

    latest.metrics = buildP185Metrics({
      state: latest,
      cycle,
      remainingBudgetMs: Math.max(0, deadlineMs - finished),
      queueDepth: p184.metrics.queueDepth,
      retriesDue: p184.retriesScheduled,
    });
    latest.nextScheduledRunAt = nextScheduledAt(latest, finished);
    evaluateP185Alerts({
      state: latest,
      storageHealthy: storage.healthy && storage.durable,
      dropboxHealthy: dropboxConfigured,
      breezyHealthy: source.sourceHealthy,
      authConfigured,
      queueDepth: p184.metrics.queueDepth,
      eligibleNow: p184.eligible,
      nowMs: finished,
    });
    await saveP185RunnerState(latest);

    return {
      ok: true,
      skipped: false,
      skipReason: null,
      cycle,
      healthHints: cycle.warnings,
      lease: { ownerId: leaseOwner, remainingMs: null },
      reconciliation: verify,
      p184,
      storageDurable: storage.durable,
      mode,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "P185 cycle failed.";
    const state = await loadP185RunnerState();
    recordCycleFailure(state, Date.now());
    pushAlert(state, {
      id: `cycle-err-${Date.now()}`,
      severity: "critical",
      code: "cycle_exception",
      message,
      recommendedAction: "Inspect logs; queued work is preserved.",
      at: new Date().toISOString(),
      active: true,
    });
    const cycle = emptyCycle(
      cycleId,
      nowMs,
      "dry_run",
      true,
      message,
      storage.durable,
      leaseOwner,
    );
    state.lastAttemptedCycle = cycle;
    await saveP185RunnerState(state);
    return skippedResult(cycle, storage.durable, leaseOwner);
  } finally {
    if (leaseOwner && leaseCycleId) {
      await releaseP185Lease({ ownerId: leaseOwner, cycleId: leaseCycleId });
    }
  }
}

async function persistSkipped(
  state: P185RunnerStateFile,
  cycle: P185CycleSummary,
  nowMs: number,
): Promise<void> {
  state.skippedCycles += 1;
  state.lastAttemptedCycle = cycle;
  state.nextScheduledRunAt = nextScheduledAt(state, nowMs);
  await saveP185RunnerState(state);
}

function skippedResult(
  cycle: P185CycleSummary,
  storageDurable: boolean,
  leaseOwnerId?: string | null,
): P185RunResult {
  return {
    ok: true,
    skipped: true,
    skipReason: cycle.skipReason,
    cycle,
    healthHints: cycle.warnings,
    lease: { ownerId: leaseOwnerId ?? cycle.leaseOwnerId, remainingMs: null },
    reconciliation: null,
    p184: null,
    storageDurable,
    mode: cycle.mode,
  };
}

/** Test helper: run with injected candidate maps (skips live source). */
export async function runP185WithCandidateMaps(input: {
  candidates: ScoredCandidateWorkflowRow[];
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  jobsByPositionId: Map<string, BreezyJob>;
  options?: P185RunOptions;
}): Promise<P185RunResult> {
  return runP185ProductionPaperworkAutomation({
    ...input.options,
    intent: input.options?.intent ?? "dry_run",
    deps: {
      ...input.options?.deps,
      loadCandidates: async ({ cursor }) => ({
        candidates: input.candidates,
        onboardingByCandidateId: input.onboardingByCandidateId,
        jobsByPositionId: input.jobsByPositionId,
        cursor: {
          ...cursor,
          watermark: "test",
          continuationToken: null,
          lastFullReconciliationAt: new Date().toISOString(),
        },
        continuationToken: null,
        exhausted: true,
        sourceHealthy: true,
        sourceDetail: "Injected test candidates.",
        scanned: input.candidates.length,
        fullReconciliation: true,
      }),
    },
  });
}
