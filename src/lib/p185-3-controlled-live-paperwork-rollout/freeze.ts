import { createHash } from "node:crypto";
import { loadP184EngineState } from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { loadP1852State } from "@/lib/p185-2-selected-hire-recovery/store";
import { loadP1853State, saveP1853State } from "@/lib/p185-3-controlled-live-paperwork-rollout/store";
import {
  hashEmail,
  newRolloutIds,
  type P1853CohortMember,
  type P1853FrozenCohort,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/types";

/**
 * Freeze an immutable cohort from P185.2 normalizations ∩ current P184 queued items.
 * Once frozen, members cannot be silently added or replaced.
 */
export async function freezeP1853Cohort(input?: {
  nowMs?: number;
  forceRefreeze?: boolean;
}): Promise<P1853FrozenCohort> {
  const state = await loadP1853State();
  if (state.cohort && !input?.forceRefreeze) {
    return state.cohort;
  }

  const p184 = await loadP184EngineState();
  const p1852 = await loadP1852State();
  const queuedIds = new Set(
    p184.queue.filter((q) => q.status === "queued" || q.status === "failed_transient").map((q) => q.candidateId),
  );

  // Latest normalization per candidate (P185.2 may have re-run)
  const latestNorm = new Map<string, (typeof p1852.normalizations)[0]>();
  for (const n of p1852.normalizations) {
    latestNorm.set(n.candidateId, n);
  }

  const { rolloutId, cohortId } = newRolloutIds();
  const nowIso = new Date(input?.nowMs ?? Date.now()).toISOString();
  const members: P1853CohortMember[] = [];

  for (const [candidateId, norm] of latestNorm) {
    if (!queuedIds.has(candidateId)) continue;
    const queueItem = p184.queue.find((q) => q.candidateId === candidateId);
    const email = queueItem?.candidateEmail ?? "";
    members.push({
      candidateId,
      resolvedPositionId: norm.resolvedPositionId,
      normalizedWorkflowStatus: "Paperwork Needed",
      evidenceRefs: norm.evidenceSummary,
      templateKey: norm.templateKey ?? "onboarding_packet",
      emailHash: email ? hashEmail(email) : createHash("sha256").update(candidateId).digest("hex").slice(0, 16),
      idempotencyKey: norm.idempotencyKey,
      queueTimestamp: queueItem?.enqueuedAt ?? nowIso,
      cohortId,
      approvalTimestamp: norm.normalizedAt,
      blockedReason: null,
      removed: false,
    });
  }

  // Prefer exact queue order if we have exactly the approved set
  members.sort((a, b) => a.queueTimestamp.localeCompare(b.queueTimestamp));

  // Hard cap: never freeze more than the P185.2 approved cohort size
  if (members.length > 25) {
    members.length = 25;
  }

  const cohort: P1853FrozenCohort = {
    rolloutId,
    cohortId,
    frozenAt: nowIso,
    approvedCount: members.length,
    members,
    immutable: true,
  };

  state.cohort = cohort;
  state.phase = "awaiting_configuration";
  state.backlog.remaining = members.filter((m) => !m.removed && !m.blockedReason).length;
  state.nextScheduledAction = "Validate deployment gates and run final dry-run.";
  await saveP1853State(state);
  return cohort;
}

/** Reject attempts to add candidates outside the frozen set. */
export function assertCandidateInFrozenCohort(
  cohort: P1853FrozenCohort,
  candidateId: string,
): boolean {
  return cohort.members.some((m) => m.candidateId === candidateId && !m.removed);
}

export function blockCohortMember(
  cohort: P1853FrozenCohort,
  candidateId: string,
  reason: string,
): P1853FrozenCohort {
  return {
    ...cohort,
    members: cohort.members.map((m) =>
      m.candidateId === candidateId ? { ...m, blockedReason: reason, removed: false } : m,
    ),
  };
}

/**
 * Frozen cohorts cannot silently expand. Returns the same cohort unchanged
 * when the candidate is not already a member (records nothing new).
 */
export function tryAddCohortMember(
  cohort: P1853FrozenCohort,
  _member: P1853CohortMember,
): { cohort: P1853FrozenCohort; added: false; reason: string } {
  return {
    cohort,
    added: false,
    reason: "Frozen cohort is immutable — candidates cannot be added after freeze.",
  };
}
