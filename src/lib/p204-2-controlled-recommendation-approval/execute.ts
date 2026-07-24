import type { BreezyCandidate } from "@/lib/breezy-api";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildDecisionRecord,
  validateBatchFinalization,
} from "@/lib/p204-2-controlled-recommendation-approval/decision";
import { proposeP2042PolicyProxyDecision } from "@/lib/p204-2-controlled-recommendation-approval/policyProxy";
import { upsertP2042OperatorDecision } from "@/lib/p204-2-controlled-recommendation-approval/store";
import {
  P204_2_AUTH_EXPIRATION_HOURS,
  P204_2_EXPECTED_COHORT_ID,
  P204_2_EXPECTED_FINGERPRINT,
  P204_2_NOTE_MARKER,
  P204_2_SOURCE_PHASE,
  type P2042Authorization,
  type P2042OperatorDecisionRecord,
  type P2042ReviewPackage,
} from "@/lib/p204-2-controlled-recommendation-approval/types";
import {
  buildReviewPackage,
  loadFreezeHashIndex,
  loadP2042FrozenCohort,
} from "@/lib/p204-2-controlled-recommendation-approval/verify";

const LIFECYCLE_FIELDS = [
  "workflowStatus",
  "paperworkStatus",
  "signatureRequestId",
  "assignedRecruiter",
  "recommendedStage",
] as const;

export function newP2042Authorization(input?: {
  actor?: string;
  cohortId?: string;
  fingerprint?: string;
  now?: Date;
}): P2042Authorization {
  const now = input?.now ?? new Date();
  return {
    actor: input?.actor ?? "p204.2-operator-pilot",
    authorizedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + P204_2_AUTH_EXPIRATION_HOURS * 60 * 60 * 1000,
    ).toISOString(),
    cohortId: input?.cohortId ?? P204_2_EXPECTED_COHORT_ID,
    fingerprint: input?.fingerprint ?? P204_2_EXPECTED_FINGERPRINT,
    allowOperatorDecisionWrites: true,
    allowLifecycleWrites: false,
  };
}

export function assertP2042Authorization(auth: P2042Authorization, now = new Date()): void {
  if (!auth.allowOperatorDecisionWrites || auth.allowLifecycleWrites) {
    throw new Error("authorization_scope_invalid");
  }
  if (Date.parse(auth.expiresAt) < now.getTime()) {
    throw new Error("authorization_expired");
  }
  if (
    auth.cohortId !== P204_2_EXPECTED_COHORT_ID ||
    auth.fingerprint !== P204_2_EXPECTED_FINGERPRINT
  ) {
    throw new Error("authorization_cohort_mismatch");
  }
}

export type P2042ExecutionResult = {
  cohortId: string;
  fingerprint: string;
  packages: P2042ReviewPackage[];
  decisions: P2042OperatorDecisionRecord[];
  staleExcluded: number;
  decisionsWritten: number;
  idempotentSkips: number;
  lifecycleChanges: number;
  paperworkNeededCreated: number;
  rejectionWrites: number;
  dropboxCalls: number;
  melWrites: number;
  automationStarts: number;
};

export async function executeP2042OperatorReviewPilot(input: {
  authorization: P2042Authorization;
  candidatesById: Map<string, BreezyCandidate>;
  workflows: Record<string, CandidateWorkflowRecord>;
  writeAuditNotes?: boolean;
}): Promise<P2042ExecutionResult> {
  assertP2042Authorization(input.authorization);
  const writeAuditNotes = input.writeAuditNotes !== false;

  const loaded = await loadP2042FrozenCohort({
    cohortId: input.authorization.cohortId,
    fingerprint: input.authorization.fingerprint,
  });
  if (loaded.recommendations.length !== 20) {
    throw new Error(
      `expected_20_recommendations_got_${loaded.recommendations.length}`,
    );
  }

  const freezeHashes = await loadFreezeHashIndex(
    loaded.cohortId,
    loaded.fingerprint,
  );

  const packages: P2042ReviewPackage[] = [];
  for (const record of loaded.recommendations) {
    const workflow = input.workflows[record.candidateId];
    const candidate = input.candidatesById.get(record.candidateId);
    packages.push(
      buildReviewPackage({
        record,
        workflow,
        candidate,
        freezeHashes: freezeHashes.get(record.redactedCandidateId) ?? null,
      }),
    );
  }

  const proposed = packages.map((pkg) => {
    const proxy = proposeP2042PolicyProxyDecision(pkg);
    return { pkg, ...proxy };
  });

  const decisionsByCandidateId = new Map(
    proposed.map((p) => [p.pkg.candidateId, p.decision]),
  );
  const checklistsByCandidateId = new Map(
    proposed.map((p) => [p.pkg.candidateId, p.evidenceChecklist]),
  );
  const batchOk = validateBatchFinalization({
    packages,
    decisionsByCandidateId,
    checklistsByCandidateId,
  });
  if (!batchOk.ok) {
    throw new Error(`${batchOk.error}:${batchOk.missing.join(",")}`);
  }

  const decisions: P2042OperatorDecisionRecord[] = [];
  let decisionsWritten = 0;
  let idempotentSkips = 0;
  let lifecycleChanges = 0;
  let paperworkNeededCreated = 0;
  let rejectionWrites = 0;
  const staleExcluded = packages.filter((p) => p.stale).length;

  for (const row of proposed) {
    const record = buildDecisionRecord({
      pkg: row.pkg,
      cohortId: loaded.cohortId,
      fingerprint: loaded.fingerprint,
      decision: row.decision,
      overrideReason: row.overrideReason,
      reviewNotes: row.reviewNotes,
      evidenceChecklist: row.evidenceChecklist,
      operatorId: input.authorization.actor,
    });

    const before = input.workflows[record.candidateId];
    const beforeSnapshot = before
      ? Object.fromEntries(
          LIFECYCLE_FIELDS.map((k) => [k, (before as Record<string, unknown>)[k] ?? null]),
        )
      : null;

    const upserted = await upsertP2042OperatorDecision(record);
    if (upserted.created) decisionsWritten += 1;
    else idempotentSkips += 1;
    decisions.push(upserted.record);

    if (writeAuditNotes && before && !row.pkg.stale) {
      const markerAlready = (before.notes ?? []).some((n) =>
        n.includes(P204_2_NOTE_MARKER),
      );
      if (!markerAlready || upserted.created) {
        const after = await upsertCandidateWorkflow({
          candidateId: record.candidateId,
          note: `${P204_2_NOTE_MARKER} ${record.decision} outcome=${record.decidedOutcome} cohort=${loaded.cohortId}`,
          audit: {
            action: "p204_2_operator_decision",
            byUserId: input.authorization.actor,
            metadata: {
              sourcePhase: P204_2_SOURCE_PHASE,
              cohortId: loaded.cohortId,
              fingerprint: loaded.fingerprint,
              decision: record.decision,
              decidedOutcome: record.decidedOutcome,
              overrideReason: record.overrideReason ?? "",
              recommendationOutcomeStatus: record.decidedOutcome,
            },
          },
        });

        for (const k of LIFECYCLE_FIELDS) {
          const b = beforeSnapshot?.[k] ?? null;
          const a = (after as Record<string, unknown>)[k] ?? null;
          if (String(b) !== String(a)) {
            lifecycleChanges += 1;
          }
        }
        if (
          after.workflowStatus === "Paperwork Needed" &&
          before.workflowStatus !== "Paperwork Needed"
        ) {
          paperworkNeededCreated += 1;
        }
        if (
          after.workflowStatus === "Not Qualified" &&
          before.workflowStatus !== "Not Qualified"
        ) {
          rejectionWrites += 1;
        }
      }
    }
  }

  return {
    cohortId: loaded.cohortId,
    fingerprint: loaded.fingerprint,
    packages,
    decisions,
    staleExcluded,
    decisionsWritten,
    idempotentSkips,
    lifecycleChanges,
    paperworkNeededCreated,
    rejectionWrites,
    dropboxCalls: 0,
    melWrites: 0,
    automationStarts: 0,
  };
}
