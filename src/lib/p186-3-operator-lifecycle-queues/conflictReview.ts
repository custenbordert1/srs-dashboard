import { randomUUID } from "node:crypto";
import {
  addOperatorNote,
  appendOperatorAudit,
} from "@/lib/p186-3-operator-lifecycle-queues/audit";
import { readP1863Flags } from "@/lib/p186-3-operator-lifecycle-queues/flags";
import type {
  P1863ActionResult,
  P1863OperatorAction,
} from "@/lib/p186-3-operator-lifecycle-queues/types";

const CONFLICT_ACTIONS: ReadonlySet<P1863OperatorAction> = new Set([
  "acknowledge_conflict",
  "request_reconciliation",
  "assign_investigation_owner",
  "mark_conflict_reviewed",
  "add_note",
]);

/**
 * Missing-shadow / conflict review — never repairs production or mutates lifecycle state.
 */
export async function executeConflictReviewAction(input: {
  action: P1863OperatorAction;
  candidateIds: string[];
  actor: string;
  role: string;
  note?: string;
  investigationOwner?: string;
  forceFlags?: { missingShadowReviewQueue: boolean };
}): Promise<P1863ActionResult> {
  const flags = readP1863Flags(
    input.forceFlags
      ? { missingShadowReviewQueue: input.forceFlags.missingShadowReviewQueue }
      : undefined,
  );
  const correlationId = `p1863-conflict-${randomUUID().slice(0, 10)}`;

  if (!flags.missingShadowReviewQueue) {
    return {
      ok: false,
      action: input.action,
      correlationId,
      succeeded: [],
      failed: input.candidateIds.map((id) => ({
        candidateId: id,
        reason: "P186_MISSING_SHADOW_REVIEW_QUEUE flag is off",
      })),
      productionEventIds: [],
      shadowObservationTriggered: false,
      detail: "Conflict review queue disabled",
    };
  }

  if (!CONFLICT_ACTIONS.has(input.action)) {
    return {
      ok: false,
      action: input.action,
      correlationId,
      succeeded: [],
      failed: input.candidateIds.map((id) => ({
        candidateId: id,
        reason: "Action not allowed on conflict queue",
      })),
      productionEventIds: [],
      shadowObservationTriggered: false,
      detail: "Only acknowledge / reconcile-request / assign / note / mark-reviewed",
    };
  }

  const succeeded: string[] = [];
  for (const candidateId of input.candidateIds) {
    const label =
      input.action === "assign_investigation_owner"
        ? `investigation:${input.investigationOwner ?? input.actor}`
        : input.action;
    await addOperatorNote({
      candidateId,
      actor: input.actor,
      note:
        input.note?.trim() ||
        `P186.3 conflict review: ${input.action} (no production repair)`,
      label,
    });
    succeeded.push(candidateId);
  }

  await appendOperatorAudit({
    actor: input.actor,
    role: input.role,
    action: input.action,
    candidateIds: input.candidateIds,
    correlationId,
    ok: true,
    detail: "Conflict review recorded — no production or lifecycle mutation",
    succeeded,
    failed: [],
  });

  return {
    ok: true,
    action: input.action,
    correlationId,
    succeeded,
    failed: [],
    productionEventIds: [],
    shadowObservationTriggered: false,
    detail: "Conflict review action persisted (observe-only)",
  };
}
