import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildJobsLookupMap } from "@/lib/breezy-global-candidates";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import {
  evaluateP184Eligibility,
} from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import { sendP184Paperwork, type P184SenderDeps } from "@/lib/p184-autonomous-paperwork-send-engine/sender";
import { loadP184EngineState, saveP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import type { P184QueueItem } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { getSignatureRequest } from "@/lib/dropbox-sign";
import { canaryExecutionAllowed, evaluateP1853LiveGatesAsync } from "@/lib/p185-3-controlled-live-paperwork-rollout/gates";
import { runP1853FinalCohortDryRun } from "@/lib/p185-3-controlled-live-paperwork-rollout/readiness";
import { loadP1853State, saveP1853State } from "@/lib/p185-3-controlled-live-paperwork-rollout/store";
import {
  hashEnvelopeId,
  type P1853SendAttempt,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import { assertCandidateInFrozenCohort, blockCohortMember } from "@/lib/p185-3-controlled-live-paperwork-rollout/freeze";
import {
  CANARY_MAX_CONCURRENT,
  CANARY_MAX_SENDS,
  CANARY_PERMANENT_FAILURE_LIMIT,
  CANARY_TRANSIENT_FAILURE_LIMIT,
  evaluateCanaryPassCriteria,
  selectSendableCohortMembers,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/limits";
import { recordP185SendUnverified, reconcileP185Envelopes } from "@/lib/p185-production-paperwork-automation-runner";

export type P1853CanaryResult = {
  executed: boolean;
  skippedReason: string | null;
  attempted: number;
  confirmed: number;
  failed: number;
  sentUnverified: number;
  passed: boolean;
  paused: boolean;
  attempts: P1853SendAttempt[];
  remainingEligible: number;
};

/**
 * Execute the five-candidate canary only when all live gates pass and authorizeCanary=true.
 * Concurrency = 1. Stops on first permanent failure or 2 transient failures.
 */
export async function executeP1853Canary(input: {
  authorizeCanary: true;
  confirmed: true;
  deps?: P184SenderDeps & {
    getSignatureRequest?: typeof getSignatureRequest;
  };
  maxSends?: number;
}): Promise<P1853CanaryResult> {
  if (!input.authorizeCanary || !input.confirmed) {
    return {
      executed: false,
      skippedReason: "Canary requires authorizeCanary=true and confirmed=true.",
      attempted: 0,
      confirmed: 0,
      failed: 0,
      sentUnverified: 0,
      passed: false,
      paused: false,
      attempts: [],
      remainingEligible: 0,
    };
  }

  const dry = await runP1853FinalCohortDryRun();
  const { gates } = await evaluateP1853LiveGatesAsync({ authorizeCanary: true });
  let state = await loadP1853State();
  const allowed = canaryExecutionAllowed(gates, state.killSwitch, state.circuitOpen);

  if (!allowed.ok) {
    state.phase = "awaiting_configuration";
    state.nextScheduledAction = allowed.blockers.join(" ");
    await saveP1853State(state);
    return {
      executed: false,
      skippedReason: allowed.blockers.join(" "),
      attempted: 0,
      confirmed: 0,
      failed: 0,
      sentUnverified: 0,
      passed: false,
      paused: false,
      attempts: [],
      remainingEligible: dry.stillEligible,
    };
  }

  if (!state.cohort) {
    return {
      executed: false,
      skippedReason: "Frozen cohort missing.",
      attempted: 0,
      confirmed: 0,
      failed: 0,
      sentUnverified: 0,
      passed: false,
      paused: false,
      attempts: [],
      remainingEligible: 0,
    };
  }

  state.phase = "canary_running";
  await saveP1853State(state);

  const maxSends = Math.min(CANARY_MAX_SENDS, input.maxSends ?? CANARY_MAX_SENDS);
  void CANARY_MAX_CONCURRENT; // enforced by sequential loop below
  const eligibleSet = new Set(dry.eligibleIds);
  const targets = selectSendableCohortMembers(state.cohort, { max: maxSends }).filter((m) =>
    eligibleSet.has(m.candidateId),
  );

  const store = await readIngestionStore();
  const bundle = await getCandidateWorkflowBundle();
  const [pub, closed] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyJobs("closed"),
  ]);
  const lookup = buildJobsLookupMap([
    ...(pub.ok ? pub.jobs : []),
    ...(closed.ok ? closed.jobs : []),
  ]);
  const byCand = new Map(listIngestedCandidates(store).map((c) => [c.candidateId, c] as const));
  const onboardingById = new Map(
    (await listAllCandidateOnboardingRecords()).map((r) => [r.candidateId, r] as const),
  );

  const attempts: P1853SendAttempt[] = [];
  let transientFailures = 0;
  let permanentFailures = 0;
  let confirmed = 0;
  let sentUnverified = 0;
  let paused = false;

  for (const member of targets) {
    // Concurrency = 1: sequential only
    if (!assertCandidateInFrozenCohort(state.cohort, member.candidateId)) {
      continue;
    }

    const p184 = await loadP184EngineState();
    const candidate = byCand.get(member.candidateId);
    if (!candidate) {
      state.cohort = blockCohortMember(state.cohort, member.candidateId, "Missing candidate");
      continue;
    }

    const row = buildScoredWorkflowRow(candidate, bundle.workflows[member.candidateId], {
      job: member.resolvedPositionId ? lookup.get(member.resolvedPositionId) : undefined,
    });
    const overlay = {
      ...row,
      positionId: member.resolvedPositionId ?? row.positionId,
      workflowStatus: "Paperwork Needed" as const,
      stage: "Paperwork Needed",
      paperworkTemplateKey: member.templateKey,
    };

    // Immediate pre-send revalidation
    if (row.signatureRequestId || row.paperworkSentAt) {
      state.totals.duplicatesPrevented += 1;
      state.cohort = blockCohortMember(state.cohort, member.candidateId, "Packet appeared pre-send");
      attempts.push({
        candidateId: member.candidateId,
        cycle: "canary",
        attemptedAt: new Date().toISOString(),
        ok: false,
        envelopeIdHash: null,
        state: "blocked",
        error: "Duplicate/active packet pre-send.",
        permanent: true,
        transient: false,
      });
      permanentFailures += 1;
      paused = true;
      state.killSwitch = true;
      state.phase = "canary_paused";
      break;
    }

    const eligibility = evaluateP184Eligibility({
      row: overlay,
      onboarding: onboardingById.get(member.candidateId) ?? null,
      job: overlay.positionId ? lookup.get(overlay.positionId) : null,
      config: { ...p184.config, mode: "live", enabled: true },
      queueItems: p184.queue.filter((q) => q.candidateId !== member.candidateId),
      completedIdempotencyKeys: new Set(p184.completedIdempotencyKeys),
      verifiedOnboardingJob: member.resolvedPositionId
        ? {
            positionId: member.resolvedPositionId,
            acceptingForOnboarding: true,
            classification: "rollout",
            detail: "P185.3 canary",
          }
        : null,
    });

    if (!eligibility.eligible) {
      state.cohort = blockCohortMember(
        state.cohort,
        member.candidateId,
        eligibility.rejectionReasons.join("; "),
      );
      state.totals.newlyBlocked += 1;
      continue;
    }

    const queueItem: P184QueueItem =
      p184.queue.find((q) => q.candidateId === member.candidateId) ??
      ({
        candidateId: member.candidateId,
        candidateName: `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || member.candidateId,
        candidateEmail: (row.email ?? "").trim().toLowerCase(),
        positionId: member.resolvedPositionId,
        jobName: null,
        templateKey: eligibility.templateKey!,
        idempotencyKey: member.idempotencyKey,
        status: "sending",
        priority: {
          agingScore: 0,
          demandScore: 0,
          applicationAgeMs: 0,
          executivePriority: 0,
          composite: 0,
        },
        enqueuedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        nextAttemptAt: new Date().toISOString(),
        lastError: null,
        permanentFailure: false,
        envelopeId: null,
        sentAt: null,
        durationMs: null,
      } satisfies P184QueueItem);

    queueItem.status = "sending";
    await saveP184EngineState({
      ...p184,
      queue: [
        ...p184.queue.filter((q) => q.candidateId !== member.candidateId),
        queueItem,
      ],
    });

    const sendResult = await sendP184Paperwork({
      item: queueItem,
      mode: "live",
      byUserId: "p185-3-canary",
      deps: input.deps,
    });

    const attempt: P1853SendAttempt = {
      candidateId: member.candidateId,
      cycle: "canary",
      attemptedAt: new Date().toISOString(),
      ok: sendResult.ok,
      envelopeIdHash: sendResult.envelopeId ? hashEnvelopeId(sendResult.envelopeId) : null,
      state: "send_requested",
      error: sendResult.error,
      permanent: sendResult.permanent,
      transient: sendResult.transient,
    };

    if (sendResult.ok && sendResult.envelopeId) {
      await recordP185SendUnverified({
        candidateId: member.candidateId,
        envelopeId: sendResult.envelopeId,
        idempotencyKey: member.idempotencyKey,
      });
      attempt.state = "sent_unverified";
      sentUnverified += 1;
      state.totals.packetsSent += 1;
      state.totals.sentUnverified += 1;

      // Persist completed idempotency + queue sent
      const after = await loadP184EngineState();
      const q = after.queue.find((x) => x.candidateId === member.candidateId);
      if (q) {
        q.status = "sent";
        q.envelopeId = sendResult.envelopeId;
        q.sentAt = sendResult.sentAt;
      }
      if (!after.completedIdempotencyKeys.includes(member.idempotencyKey)) {
        after.completedIdempotencyKeys.push(member.idempotencyKey);
      }
      await saveP184EngineState(after);

      try {
        const getSig = input.deps?.getSignatureRequest ?? getSignatureRequest;
        await getSig(sendResult.envelopeId);
        await reconcileP185Envelopes({
          deps: { getSignatureRequest: getSig },
        });
        attempt.state = "confirmed_sent";
        confirmed += 1;
        state.totals.packetsConfirmed += 1;
        state.totals.sentUnverified = Math.max(0, state.totals.sentUnverified - 1);
        sentUnverified = Math.max(0, sentUnverified - 1);
      } catch {
        // remain sent_unverified — never resend
      }
    } else {
      attempt.state = "failed";
      state.totals.failed += 1;
      if (sendResult.permanent) {
        permanentFailures += 1;
        if (permanentFailures >= CANARY_PERMANENT_FAILURE_LIMIT) {
          paused = true;
          state.phase = "canary_paused";
          state.circuitOpen = true;
        }
      } else {
        transientFailures += 1;
        if (transientFailures >= CANARY_TRANSIENT_FAILURE_LIMIT) {
          paused = true;
          state.phase = "canary_paused";
          state.circuitOpen = true;
        }
      }
    }

    attempts.push(attempt);
    state.canary.attempts.push(attempt);
    state.canary.attempted = attempts.length;
    state.canary.confirmed = confirmed;
    state.canary.failed = permanentFailures + transientFailures;
    state.canary.sentUnverified = sentUnverified;
    await saveP1853State(state);

    if (paused) break;
  }

  state = await loadP1853State();
  const passEval = evaluateCanaryPassCriteria({
    attempted: attempts.length,
    permanentFailures,
    transientFailures,
    paused,
    attemptsOk: attempts.every(
      (a) => a.ok && (a.state === "confirmed_sent" || a.state === "sent_unverified"),
    ),
  });
  const passed = passEval.passed;

  state.canary.passed = passed;
  state.canary.paused = paused;
  if (passed) {
    state.phase = "canary_passed_awaiting_backlog";
    state.nextScheduledAction =
      "Canary Passed — Awaiting Backlog Authorization. Do not release remaining backlog without separate operator decision.";
  } else if (paused) {
    state.phase = "canary_failed_paused";
    state.nextScheduledAction = "Canary Failed — Rollout Paused. Investigate canary failures; do not release remaining backlog.";
  }
  state.backlog.remaining = Math.max(
    0,
    (state.cohort?.members.filter((m) => !m.blockedReason && !m.removed).length ?? 0) -
      state.totals.packetsSent,
  );
  await saveP1853State(state);

  return {
    executed: true,
    skippedReason: null,
    attempted: attempts.length,
    confirmed,
    failed: permanentFailures + transientFailures,
    sentUnverified,
    passed,
    paused,
    attempts,
    remainingEligible: state.backlog.remaining,
  };
}
