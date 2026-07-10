import type { getSignatureRequest } from "@/lib/dropbox-sign";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildJobsLookupMap } from "@/lib/breezy-global-candidates";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { evaluateP184Eligibility } from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import { sendP184Paperwork, type P184SenderDeps } from "@/lib/p184-autonomous-paperwork-send-engine/sender";
import { loadP184EngineState, saveP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import type { P184QueueItem } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import {
  assertCandidateInFrozenCohort,
  blockCohortMember,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/freeze";
import { evaluateP1853LiveGatesAsync } from "@/lib/p185-3-controlled-live-paperwork-rollout/gates";
import { loadP1853State, saveP1853State } from "@/lib/p185-3-controlled-live-paperwork-rollout/store";
import {
  hashEnvelopeId,
  type P1853SendAttempt,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/types";
import {
  BACKLOG_MAX_SENDS_PER_CYCLE,
  BACKLOG_MAX_CONCURRENT,
  selectSendableCohortMembers,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/limits";
import {
  recordP185SendUnverified,
  reconcileP185Envelopes,
} from "@/lib/p185-production-paperwork-automation-runner";

export type P1853BacklogCycleResult = {
  executed: boolean;
  skippedReason: string | null;
  cycle: number;
  attempted: number;
  confirmed: number;
  failed: number;
  remaining: number;
  complete: boolean;
  attempts: P1853SendAttempt[];
};

/**
 * Release remaining frozen-cohort backlog after canary passes.
 * Max 10/cycle, concurrency 2. Never expands outside frozen cohort.
 */
export async function executeP1853BacklogCycle(input: {
  authorizeBacklog: true;
  confirmed: true;
  deps?: P184SenderDeps & {
    getSignatureRequest?: typeof getSignatureRequest;
  };
  maxSends?: number;
}): Promise<P1853BacklogCycleResult> {
  if (!input.authorizeBacklog || !input.confirmed) {
    return {
      executed: false,
      skippedReason: "Backlog release requires authorizeBacklog=true and confirmed=true.",
      cycle: 0,
      attempted: 0,
      confirmed: 0,
      failed: 0,
      remaining: 0,
      complete: false,
      attempts: [],
    };
  }

  let state = await loadP1853State();
  if (!state.canary.passed) {
    return {
      executed: false,
      skippedReason: "Canary has not passed — backlog release blocked.",
      cycle: state.backlog.cycle,
      attempted: 0,
      confirmed: 0,
      failed: 0,
      remaining: state.backlog.remaining,
      complete: false,
      attempts: [],
    };
  }
  if (state.killSwitch || state.circuitOpen) {
    return {
      executed: false,
      skippedReason: state.killSwitch ? "Kill switch active." : "Circuit breaker open.",
      cycle: state.backlog.cycle,
      attempted: 0,
      confirmed: 0,
      failed: 0,
      remaining: state.backlog.remaining,
      complete: false,
      attempts: [],
    };
  }
  if (!state.cohort) {
    return {
      executed: false,
      skippedReason: "Frozen cohort missing.",
      cycle: 0,
      attempted: 0,
      confirmed: 0,
      failed: 0,
      remaining: 0,
      complete: false,
      attempts: [],
    };
  }

  const { gates } = await evaluateP1853LiveGatesAsync({ authorizeCanary: true });
  if (
    !gates.cronSecretConfigured ||
    !gates.productionAutomationEnabled ||
    !gates.durableStorageHealthy ||
    !gates.dropboxSignConfigured ||
    !gates.p184EnabledForLive ||
    !gates.p184ModeLive
  ) {
    return {
      executed: false,
      skippedReason: "Live gates incomplete for backlog release.",
      cycle: state.backlog.cycle,
      attempted: 0,
      confirmed: 0,
      failed: 0,
      remaining: state.backlog.remaining,
      complete: false,
      attempts: [],
    };
  }

  const alreadySent = new Set(
    state.canary.attempts.filter((a) => a.ok).map((a) => a.candidateId),
  );
  for (const a of state.canary.attempts) {
    // also track backlog attempts from prior cycles via totals — use completed keys
  }
  const p184Pre = await loadP184EngineState();
  const completedKeys = new Set(p184Pre.completedIdempotencyKeys);

  const maxSends = Math.min(BACKLOG_MAX_SENDS_PER_CYCLE, input.maxSends ?? BACKLOG_MAX_SENDS_PER_CYCLE);
  const targets = selectSendableCohortMembers(state.cohort, {
    excludeIds: alreadySent,
    max: maxSends,
  }).filter((m) => !completedKeys.has(m.idempotencyKey));

  state.phase = "backlog_releasing";
  state.backlog.cycle += 1;
  await saveP1853State(state);

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
  let confirmed = 0;
  let failed = 0;
  let cycleFailures = 0;

  // Concurrency 2: process in pairs sequentially within each pair await both
  for (let i = 0; i < targets.length; i += BACKLOG_MAX_CONCURRENT) {
    if (state.killSwitch || state.circuitOpen || cycleFailures >= 3) break;
    const batch = targets.slice(i, i + BACKLOG_MAX_CONCURRENT);

    const batchResults = await Promise.all(
      batch.map(async (member) => {
        if (!assertCandidateInFrozenCohort(state.cohort!, member.candidateId)) {
          return null;
        }
        const candidate = byCand.get(member.candidateId);
        if (!candidate) {
          state.cohort = blockCohortMember(state.cohort!, member.candidateId, "Missing candidate");
          return null;
        }
        const row = buildScoredWorkflowRow(candidate, bundle.workflows[member.candidateId], {
          job: member.resolvedPositionId ? lookup.get(member.resolvedPositionId) : undefined,
        });
        if (row.signatureRequestId || row.paperworkSentAt) {
          state.totals.duplicatesPrevented += 1;
          state.cohort = blockCohortMember(
            state.cohort!,
            member.candidateId,
            "Packet appeared pre-send",
          );
          return {
            candidateId: member.candidateId,
            cycle: "backlog" as const,
            attemptedAt: new Date().toISOString(),
            ok: false,
            envelopeIdHash: null,
            state: "blocked" as const,
            error: "Duplicate/active packet pre-send.",
            permanent: true,
            transient: false,
          } satisfies P1853SendAttempt;
        }

        const p184 = await loadP184EngineState();
        const overlay = {
          ...row,
          positionId: member.resolvedPositionId ?? row.positionId,
          workflowStatus: "Paperwork Needed" as const,
          stage: "Paperwork Needed",
          paperworkTemplateKey: member.templateKey,
        };
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
                detail: "P185.3 backlog",
              }
            : null,
        });
        if (!eligibility.eligible) {
          state.cohort = blockCohortMember(
            state.cohort!,
            member.candidateId,
            eligibility.rejectionReasons.join("; "),
          );
          state.totals.newlyBlocked += 1;
          return null;
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

        const sendResult = await sendP184Paperwork({
          item: queueItem,
          mode: "live",
          byUserId: "p185-3-backlog",
          deps: input.deps,
        });

        const attempt: P1853SendAttempt = {
          candidateId: member.candidateId,
          cycle: "backlog",
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
            const getSig = input.deps?.getSignatureRequest;
            if (getSig) await getSig(sendResult.envelopeId);
            await reconcileP185Envelopes({
              deps: getSig ? { getSignatureRequest: getSig } : undefined,
            });
            attempt.state = "confirmed_sent";
          } catch {
            // remain sent_unverified
          }
        } else {
          attempt.state = "failed";
        }
        return attempt;
      }),
    );

    for (const attempt of batchResults) {
      if (!attempt) continue;
      attempts.push(attempt);
      if (attempt.ok) {
        state.totals.packetsSent += 1;
        if (attempt.state === "confirmed_sent") {
          confirmed += 1;
          state.totals.packetsConfirmed += 1;
        } else if (attempt.state === "sent_unverified") {
          state.totals.sentUnverified += 1;
        }
      } else {
        failed += 1;
        cycleFailures += 1;
        state.totals.failed += 1;
      }
    }

    if (cycleFailures >= 3) {
      state.circuitOpen = true;
      state.phase = "rollout_blocked";
      break;
    }
  }

  const sentIds = new Set([
    ...alreadySent,
    ...attempts.filter((a) => a.ok).map((a) => a.candidateId),
  ]);
  const remaining = selectSendableCohortMembers(state.cohort, {
    excludeIds: sentIds,
    max: 10_000,
  }).length;

  state.backlog.attempted += attempts.length;
  state.backlog.confirmed += confirmed;
  state.backlog.failed += failed;
  state.backlog.remaining = remaining;
  const complete = remaining === 0 && !state.circuitOpen && !state.killSwitch;
  if (complete) {
    state.phase = "backlog_complete";
    state.nextScheduledAction = "Rollout complete — continue reconciliation until signed/declined/canceled.";
  } else if (!state.circuitOpen && !state.killSwitch) {
    state.nextScheduledAction = `Next backlog cycle in ~10 minutes (remaining ${remaining}).`;
  }
  await saveP1853State(state);

  return {
    executed: true,
    skippedReason: null,
    cycle: state.backlog.cycle,
    attempted: attempts.length,
    confirmed,
    failed,
    remaining,
    complete,
    attempts,
  };
}
