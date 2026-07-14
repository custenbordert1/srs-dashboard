import { randomUUID } from "node:crypto";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { observeWorkflowUpsertSafe } from "@/lib/p186-2-event-adapters";
import { getSignatureRequest } from "@/lib/dropbox-sign";
import { sendP184Paperwork } from "@/lib/p184-autonomous-paperwork-send-engine/sender";
import {
  loadP184EngineState,
  saveP184EngineState,
} from "@/lib/p184-autonomous-paperwork-send-engine/store";
import type { P184QueueItem } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { evaluateP184RateLimit, canAcquireSendSlot } from "@/lib/p184-autonomous-paperwork-send-engine/rateLimiter";
import { loadLiveP185Candidates } from "@/lib/p185-production-paperwork-automation-runner/candidateSource";
import {
  acquireP185Lease,
  heartbeatP185Lease,
  releaseP185Lease,
} from "@/lib/p185-production-paperwork-automation-runner/lease";
import {
  loadP185RunnerState,
  saveP185RunnerState,
} from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import {
  reconcileP185Envelopes,
  recordP185SendUnverified,
} from "@/lib/p185-production-paperwork-automation-runner/reconciliation";
import { openP185CircuitBreaker } from "@/lib/p185-production-paperwork-automation-runner/safety";
import {
  assertNoUpstreamAutomation,
  evaluateP192Eligibility,
} from "@/lib/p192-supervised-paperwork-runner/eligibility";
import {
  assertProductionTestModeOff,
  sendTemplateSignatureRequestProductionOnly,
  storageHealthSummary,
} from "@/lib/p192-supervised-paperwork-runner/productionMode";
import {
  P192_INTERVAL_MS,
  P192_MAX_FAILURES_PER_CYCLE,
  P192_MAX_SENDS_PER_CYCLE,
  P192_RATE_LIMITS,
  type P192CycleSummary,
} from "@/lib/p192-supervised-paperwork-runner/types";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

export type P192CycleResult = {
  ok: boolean;
  paused: boolean;
  pauseReason: string | null;
  summary: P192CycleSummary;
};

function emptyEnvelopeTotals(): Record<string, number> {
  return {
    pending_signature: 0,
    viewed: 0,
    signed: 0,
    declined: 0,
    canceled: 0,
    expired: 0,
    failed: 0,
    unknown: 0,
    confirmed_sent: 0,
    sent_unverified: 0,
  };
}

/**
 * One supervised cycle: reconcile → discover PN → validate → send (prod) → confirm.
 */
export async function runP192Cycle(input: {
  cycleNumber: number;
  ownerId: string;
  nowMs?: number;
}): Promise<P192CycleResult> {
  const nowMs = input.nowMs ?? Date.now();
  const cycleId = randomUUID();
  const startedAt = new Date(nowMs).toISOString();
  const upstream = assertNoUpstreamAutomation();
  const storage = storageHealthSummary();

  const testGate = assertProductionTestModeOff();
  if (!testGate.ok) {
    return {
      ok: false,
      paused: true,
      pauseReason: testGate.detail,
      summary: baseSummary({
        cycleId,
        cycleNumber: input.cycleNumber,
        startedAt,
        finishedAt: new Date().toISOString(),
        pauseReason: testGate.detail,
        paused: true,
        testMode: testGate.testMode,
        storageStatus: storage.detail,
        leaseStatus: "not_acquired",
      }),
    };
  }

  const p185 = await loadP185RunnerState();
  if (p185.safety.killSwitch) {
    return pausedResult(input, cycleId, startedAt, "Kill switch active", testGate.testMode, storage);
  }
  if (p185.circuit.open) {
    return pausedResult(
      input,
      cycleId,
      startedAt,
      p185.circuit.reason ?? "Circuit open",
      testGate.testMode,
      storage,
    );
  }

  const lease = await acquireP185Lease({
    ownerId: input.ownerId,
    cycleId,
    nowMs,
    ttlMs: Math.max(p185.safety.leaseTtlMs, 120_000),
  });
  if (!lease.acquired) {
    return pausedResult(
      input,
      cycleId,
      startedAt,
      lease.reason,
      testGate.testMode,
      storage,
      "blocked",
    );
  }

  let cyclePaused = false;
  let pauseReason: string | null = null;
  let attempted = 0;
  let confirmedSent = 0;
  let sentUnverified = 0;
  let failed = 0;
  let skipped = 0;
  let duplicatesPrevented = 0;
  const envelopeTotals = emptyEnvelopeTotals();

  try {
    await heartbeatP185Lease({
      ownerId: lease.lease.ownerId,
      cycleId: lease.lease.cycleId,
    });

    const reconciliation = await reconcileP185Envelopes({
      nowMs,
      limit: 200,
      deps: { getSignatureRequest },
    });
    for (const t of reconciliation.transitions) {
      const key = t.to in envelopeTotals ? t.to : "unknown";
      envelopeTotals[key] = (envelopeTotals[key] ?? 0) + 1;
    }

    const source = await loadLiveP185Candidates({
      cursor: {
        watermark: null,
        continuationToken: null,
        lastFullReconciliationAt: null,
        candidatesScannedTotal: 0,
      },
      maxCandidates: 500,
      fullReconciliationIntervalMs: P192_INTERVAL_MS,
      nowMs,
    });
    const workflows = await getCandidateWorkflowState();
    let p184 = await loadP184EngineState();
    if (p184.config.mode !== "live" || !p184.config.enabled) {
      cyclePaused = true;
      pauseReason = `P184 not live (mode=${p184.config.mode} enabled=${p184.config.enabled})`;
      throw new Error(pauseReason);
    }

    const pnRows = source.candidates.filter((r) => r.workflowStatus === "Paperwork Needed");
    const eligibleRows: Array<{
      row: (typeof pnRows)[number];
      eligibility: ReturnType<typeof evaluateP192Eligibility>;
    }> = [];

    for (const row of pnRows) {
      const eligibility = evaluateP192Eligibility({
        row,
        workflow: workflows[row.candidateId],
        onboarding: source.onboardingByCandidateId.get(row.candidateId) ?? null,
        job: row.positionId ? source.jobsByPositionId.get(row.positionId) : null,
        config: p184.config,
        queueItems: p184.queue,
        completedIdempotencyKeys: new Set(p184.completedIdempotencyKeys),
      });
      if (eligibility.eligible) eligibleRows.push({ row, eligibility });
      else if (eligibility.blockers.some((b) => /duplicate|envelope|idempotency/i.test(b))) {
        duplicatesPrevented += 1;
      } else {
        skipped += 1;
      }
    }

    const rate = evaluateP184RateLimit({
      config: { ...P192_RATE_LIMITS },
      sendTimestamps: p184.sendTimestamps,
      inFlight: 0,
      nowMs,
    });

    for (const { row, eligibility } of eligibleRows.slice(0, P192_MAX_SENDS_PER_CYCLE)) {
      if (failed >= P192_MAX_FAILURES_PER_CYCLE) {
        cyclePaused = true;
        pauseReason = `Max real failures per cycle (${P192_MAX_FAILURES_PER_CYCLE}) reached`;
        break;
      }
      if (!canAcquireSendSlot(rate) || attempted >= P192_MAX_SENDS_PER_CYCLE) break;

      // Hard gate: never process outside Paperwork Needed
      const liveWf = (await getCandidateWorkflowState())[row.candidateId];
      if (liveWf?.workflowStatus !== "Paperwork Needed") {
        cyclePaused = true;
        pauseReason = `Candidate ${row.candidateId.slice(0, 6)}… outside Paperwork Needed`;
        break;
      }

      const recheckGate = assertProductionTestModeOff();
      if (!recheckGate.ok) {
        cyclePaused = true;
        pauseReason = recheckGate.detail;
        break;
      }

      // Revalidate immediately before send
      p184 = await loadP184EngineState();
      const revalidate = evaluateP192Eligibility({
        row,
        workflow: liveWf,
        onboarding: source.onboardingByCandidateId.get(row.candidateId) ?? null,
        job: row.positionId ? source.jobsByPositionId.get(row.positionId) : null,
        config: p184.config,
        queueItems: p184.queue,
        completedIdempotencyKeys: new Set(p184.completedIdempotencyKeys),
      });
      if (!revalidate.eligible || !revalidate.templateKey || !revalidate.idempotencyKey) {
        skipped += 1;
        continue;
      }

      const nowIso = new Date().toISOString();
      const queueItem: P184QueueItem = {
        candidateId: row.candidateId,
        candidateName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.candidateId,
        candidateEmail: (row.email ?? "").trim().toLowerCase(),
        positionId: row.positionId,
        jobName: row.positionName ?? null,
        templateKey: revalidate.templateKey as OnboardingTemplateKey,
        idempotencyKey: revalidate.idempotencyKey,
        status: "sending",
        priority: {
          agingScore: 0,
          demandScore: 0,
          applicationAgeMs: 0,
          executivePriority: 0,
          composite: 0,
        },
        enqueuedAt: nowIso,
        updatedAt: nowIso,
        retryCount: 0,
        nextAttemptAt: nowIso,
        lastError: null,
        permanentFailure: false,
        envelopeId: null,
        sentAt: null,
        durationMs: null,
      };

      // Atomic-ish claim: mark sending + persist idempotency intent
      await saveP184EngineState({
        ...p184,
        queue: [...p184.queue.filter((q) => q.candidateId !== row.candidateId), queueItem],
      });

      attempted += 1;
      const sendResult = await sendP184Paperwork({
        item: queueItem,
        mode: "live",
        byUserId: "p192-supervised-runner",
        deps: {
          sendDeps: {
            sendTemplateSignatureRequest: sendTemplateSignatureRequestProductionOnly,
          },
        },
      });

      if (!sendResult.ok || !sendResult.envelopeId || sendResult.simulated) {
        failed += 1;
        if (sendResult.permanent || /template|mismatch/i.test(sendResult.error ?? "")) {
          cyclePaused = true;
          pauseReason = sendResult.error ?? "Permanent send failure";
          const st = await loadP185RunnerState();
          openP185CircuitBreaker(st, pauseReason, Date.now());
          await saveP185RunnerState(st);
          break;
        }
        continue;
      }

      await recordP185SendUnverified({
        candidateId: row.candidateId,
        envelopeId: sendResult.envelopeId,
        idempotencyKey: revalidate.idempotencyKey,
      });
      sentUnverified += 1;

      const after = await loadP184EngineState();
      const q = after.queue.find((x) => x.candidateId === row.candidateId);
      if (q) {
        q.status = "sent";
        q.envelopeId = sendResult.envelopeId;
        q.sentAt = sendResult.sentAt;
      }
      if (!after.completedIdempotencyKeys.includes(revalidate.idempotencyKey)) {
        after.completedIdempotencyKeys.push(revalidate.idempotencyKey);
      }
      after.sendTimestamps = [...after.sendTimestamps, new Date().toISOString()].slice(-500);
      await saveP184EngineState(after);

      try {
        await getSignatureRequest(sendResult.envelopeId);
        await reconcileP185Envelopes({
          deps: { getSignatureRequest },
        });
        confirmedSent += 1;
        sentUnverified = Math.max(0, sentUnverified - 1);
        envelopeTotals.confirmed_sent += 1;

        const wfAfter = (await getCandidateWorkflowState())[row.candidateId];
        if (wfAfter) {
          await observeWorkflowUpsertSafe({
            candidateId: wfAfter.candidateId,
            workflowStatus: wfAfter.workflowStatus,
            paperworkStatus: wfAfter.paperworkStatus,
          }).catch(() => undefined);
        }
      } catch (err) {
        failed += 1;
        cyclePaused = true;
        pauseReason = `Envelope verify failed: ${err instanceof Error ? err.message : String(err)}`;
        const st = await loadP185RunnerState();
        openP185CircuitBreaker(st, pauseReason, Date.now());
        await saveP185RunnerState(st);
        break;
      }

      await heartbeatP185Lease({
        ownerId: lease.lease.ownerId,
        cycleId: lease.lease.cycleId,
      });
    }

    const remainingEligible = Math.max(0, eligibleRows.length - confirmedSent);

    const summary: P192CycleSummary = {
      cycleId,
      cycleNumber: input.cycleNumber,
      startedAt,
      finishedAt: new Date().toISOString(),
      evaluated: pnRows.length,
      eligible: eligibleRows.length,
      queued: eligibleRows.length,
      attempted,
      confirmedSent,
      sentUnverified,
      failed,
      skipped,
      duplicatesPrevented,
      remainingEligible,
      envelopeTotals,
      p184Mode: (await loadP184EngineState()).config.mode,
      storageStatus: storage.healthy ? "healthy" : "unhealthy",
      leaseStatus: "held_then_released",
      circuitStatus: (await loadP185RunnerState()).circuit.open ? "open" : "closed",
      killSwitch: (await loadP185RunnerState()).safety.killSwitch,
      testMode: false,
      nextCycleAt: new Date(Date.now() + P192_INTERVAL_MS).toISOString(),
      paused: cyclePaused,
      pauseReason,
      ...upstream,
    };

    return { ok: !cyclePaused, paused: cyclePaused, pauseReason, summary };
  } finally {
    await releaseP185Lease({
      ownerId: lease.lease.ownerId,
      cycleId: lease.lease.cycleId,
    });
  }
}

function baseSummary(input: {
  cycleId: string;
  cycleNumber: number;
  startedAt: string;
  finishedAt: string;
  pauseReason: string | null;
  paused: boolean;
  testMode: boolean | null;
  storageStatus: string;
  leaseStatus: string;
}): P192CycleSummary {
  return {
    cycleId: input.cycleId,
    cycleNumber: input.cycleNumber,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    evaluated: 0,
    eligible: 0,
    queued: 0,
    attempted: 0,
    confirmedSent: 0,
    sentUnverified: 0,
    failed: 0,
    skipped: 0,
    duplicatesPrevented: 0,
    remainingEligible: 0,
    envelopeTotals: emptyEnvelopeTotals(),
    p184Mode: "unknown",
    storageStatus: input.storageStatus,
    leaseStatus: input.leaseStatus,
    circuitStatus: "unknown",
    killSwitch: false,
    testMode: input.testMode,
    nextCycleAt: new Date(Date.now() + P192_INTERVAL_MS).toISOString(),
    paused: input.paused,
    pauseReason: input.pauseReason,
    recommendationsAutomated: 0,
    approvalsAutomated: 0,
    melWrites: 0,
  };
}

function pausedResult(
  input: { cycleNumber: number; ownerId: string },
  cycleId: string,
  startedAt: string,
  reason: string,
  testMode: boolean | null,
  storage: { detail: string },
  leaseStatus = "not_acquired",
): P192CycleResult {
  return {
    ok: false,
    paused: true,
    pauseReason: reason,
    summary: baseSummary({
      cycleId,
      cycleNumber: input.cycleNumber,
      startedAt,
      finishedAt: new Date().toISOString(),
      pauseReason: reason,
      paused: true,
      testMode,
      storageStatus: storage.detail,
      leaseStatus,
    }),
  };
}
