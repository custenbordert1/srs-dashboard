import { randomUUID } from "node:crypto";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { observeWorkflowUpsertSafe } from "@/lib/p186-2-event-adapters";
import { readP1863Flags } from "@/lib/p186-3-operator-lifecycle-queues/flags";
import {
  evaluateApprovalGates,
  expectedStatesForAction,
} from "@/lib/p186-3-operator-lifecycle-queues/gates";
import type { P1863SourceRow } from "@/lib/p186-3-operator-lifecycle-queues/queues";
import type {
  P1863ActionResult,
  P1863OperatorAction,
} from "@/lib/p186-3-operator-lifecycle-queues/types";
import { appendOperatorAudit } from "@/lib/p186-3-operator-lifecycle-queues/audit";

export type ApprovalDeps = {
  upsert?: typeof upsertCandidateWorkflow;
  observe?: typeof observeWorkflowUpsertSafe;
  nowIso?: () => string;
};

/**
 * Approval actions write ONLY through the production workflow store.
 * P186 never directly mutates authoritative lifecycle shadow as a substitute for production.
 * After success, shadow is updated via existing observe hooks / explicit observe call.
 */
export async function executeOperatorApprovalAction(input: {
  action: P1863OperatorAction;
  row: P1863SourceRow;
  actor: string;
  role: string;
  operatorAuthorized: boolean;
  note?: string;
  alreadyApproved?: boolean;
  conflictingOperation?: boolean;
  deps?: ApprovalDeps;
  forceFlags?: { approvalActions: boolean };
}): Promise<P1863ActionResult> {
  const flags = readP1863Flags(
    input.forceFlags ? { approvalActions: input.forceFlags.approvalActions } : undefined,
  );
  const correlationId = `p1863-${randomUUID().slice(0, 12)}`;
  const upsert = input.deps?.upsert ?? upsertCandidateWorkflow;
  const observe = input.deps?.observe ?? observeWorkflowUpsertSafe;

  if (!flags.approvalActions) {
    return {
      ok: false,
      action: input.action,
      correlationId,
      succeeded: [],
      failed: [{ candidateId: input.row.candidateId, reason: "P186_APPROVAL_ACTIONS flag is off" }],
      productionEventIds: [],
      shadowObservationTriggered: false,
      detail: "Approval actions disabled",
    };
  }

  const gates = evaluateApprovalGates({
    action: input.action,
    row: input.row,
    expectedProductionStates: expectedStatesForAction(input.action),
    operatorAuthorized: input.operatorAuthorized,
    alreadyApproved: input.alreadyApproved,
    conflictingOperation: input.conflictingOperation,
  });
  if (!gates.ok) {
    await appendOperatorAudit({
      actor: input.actor,
      role: input.role,
      action: input.action,
      candidateIds: [input.row.candidateId],
      correlationId,
      ok: false,
      detail: gates.failures.map((f) => f.message).join("; "),
      succeeded: [],
      failed: gates.failures.map((f) => ({
        candidateId: input.row.candidateId,
        reason: f.message,
      })),
    });
    return {
      ok: false,
      action: input.action,
      correlationId,
      succeeded: [],
      failed: gates.failures.map((f) => ({
        candidateId: input.row.candidateId,
        reason: f.message,
      })),
      productionEventIds: [],
      shadowObservationTriggered: false,
      detail: "Approval gates blocked action",
    };
  }

  const now = input.deps?.nowIso?.() ?? new Date().toISOString();
  let workflowStatus: string | undefined;
  let note = input.note?.trim() || `P186.3 ${input.action} by ${input.actor}`;
  let forceWorkflowStatus = false;

  switch (input.action) {
    case "approve_hiring_recommendation":
    case "mark_paperwork_review_approved":
      workflowStatus = "Paperwork Needed";
      forceWorkflowStatus = true;
      break;
    case "reject_hiring_recommendation":
      workflowStatus = "Not Qualified";
      forceWorkflowStatus = true;
      break;
    case "return_to_recruiter":
      workflowStatus = "Needs Review";
      forceWorkflowStatus = true;
      break;
    case "place_hold":
      note = `[HOLD] ${note}`;
      break;
    case "remove_hold":
      note = `[HOLD REMOVED] ${note}`;
      break;
    case "mark_onboarding_exception_reviewed":
      note = `[ONBOARDING REVIEWED] ${note}`;
      break;
    case "mark_mel_ready_review_approved":
      workflowStatus = "Ready for MEL";
      forceWorkflowStatus = true;
      break;
    default:
      return {
        ok: false,
        action: input.action,
        correlationId,
        succeeded: [],
        failed: [{ candidateId: input.row.candidateId, reason: "Not a production write action" }],
        productionEventIds: [],
        shadowObservationTriggered: false,
        detail: "Unsupported approval action",
      };
  }

  try {
    const record = await upsert({
      candidateId: input.row.candidateId,
      workflowStatus: workflowStatus as never,
      forceWorkflowStatus,
      note,
      audit: {
        action: `p1863_${input.action}`,
        byUserId: input.actor,
        metadata: { correlationId, phase: "P186.3", liveSend: false },
      },
    });

    // Explicit observe for tests / when workflow hook flags are off
    await observe({
      candidateId: record.candidateId,
      workflowStatus: record.workflowStatus,
      paperworkStatus: record.paperworkStatus,
    }).catch(() => undefined);

    await appendOperatorAudit({
      actor: input.actor,
      role: input.role,
      action: input.action,
      candidateIds: [input.row.candidateId],
      correlationId,
      ok: true,
      detail: `Production write ok at ${now}`,
      succeeded: [input.row.candidateId],
      failed: [],
      productionEventIds: [`wf:${input.row.candidateId}:${now}`],
    });

    return {
      ok: true,
      action: input.action,
      correlationId,
      succeeded: [input.row.candidateId],
      failed: [],
      productionEventIds: [`wf:${input.row.candidateId}:${now}`],
      shadowObservationTriggered: true,
      detail: "Production approval persisted; shadow observe triggered",
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await appendOperatorAudit({
      actor: input.actor,
      role: input.role,
      action: input.action,
      candidateIds: [input.row.candidateId],
      correlationId,
      ok: false,
      detail: reason,
      succeeded: [],
      failed: [{ candidateId: input.row.candidateId, reason }],
    });
    return {
      ok: false,
      action: input.action,
      correlationId,
      succeeded: [],
      failed: [{ candidateId: input.row.candidateId, reason }],
      productionEventIds: [],
      shadowObservationTriggered: false,
      detail: "Production write failed — no shadow mutation",
    };
  }
}
