import { randomUUID } from "node:crypto";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import { observeWorkflowUpsertSafe } from "@/lib/p186-2-event-adapters";
import { appendP1865Audit, enqueueMelExportItem } from "@/lib/p186-5-post-sign-mel-queue/melQueue";
import { readP1865Flags } from "@/lib/p186-5-post-sign-mel-queue/flags";
import { canPerformP1865Action } from "@/lib/p186-5-post-sign-mel-queue/rbac";
import type {
  P1865OperatorAction,
  P1865ProductRole,
} from "@/lib/p186-5-post-sign-mel-queue/types";

export type ReviewActionResult = {
  ok: boolean;
  action: P1865OperatorAction;
  correlationId: string;
  productionEventIds: string[];
  shadowObservationTriggered: boolean;
  melQueueTouched: boolean;
  detail: string;
};

export type ReviewDeps = {
  upsert?: typeof upsertCandidateWorkflow;
  observe?: typeof observeWorkflowUpsertSafe;
};

/**
 * Authorized review actions write ONLY through production workflow store.
 * P186 never CAS-updates authoritative production lifecycle.
 */
export async function executePostSignReviewAction(input: {
  action: P1865OperatorAction;
  candidateId: string;
  actor: string;
  role: P1865ProductRole;
  note?: string;
  jobOrProjectId?: string | null;
  onboardingAssignmentId?: string | null;
  investigationOwner?: string;
  deps?: ReviewDeps;
  forceFlags?: Partial<{
    onboardingReviewActions: boolean;
    readyForMelReviewActions: boolean;
    melExportQueue: boolean;
  }>;
}): Promise<ReviewActionResult> {
  const flags = readP1865Flags(input.forceFlags);
  const correlationId = `p1865-${randomUUID().slice(0, 12)}`;
  const upsert = input.deps?.upsert ?? upsertCandidateWorkflow;
  const observe = input.deps?.observe ?? observeWorkflowUpsertSafe;

  if (!canPerformP1865Action(input.role, input.action)) {
    return {
      ok: false,
      action: input.action,
      correlationId,
      productionEventIds: [],
      shadowObservationTriggered: false,
      melQueueTouched: false,
      detail: `Role ${input.role} cannot perform ${input.action}`,
    };
  }

  const needsOnboardingFlag =
    input.action === "approve_onboarding_completion" ||
    input.action === "reject_onboarding_completion" ||
    input.action === "request_missing_documents" ||
    input.action === "place_onboarding_hold" ||
    input.action === "clear_onboarding_hold" ||
    input.action === "return_for_correction";

  const needsMelFlag = input.action === "approve_ready_for_mel";

  if (needsOnboardingFlag && !flags.onboardingReviewActions) {
    return {
      ok: false,
      action: input.action,
      correlationId,
      productionEventIds: [],
      shadowObservationTriggered: false,
      melQueueTouched: false,
      detail: "P186_ONBOARDING_REVIEW_ACTIONS flag is off",
    };
  }
  if (needsMelFlag && !flags.readyForMelReviewActions) {
    return {
      ok: false,
      action: input.action,
      correlationId,
      productionEventIds: [],
      shadowObservationTriggered: false,
      melQueueTouched: false,
      detail: "P186_READY_FOR_MEL_REVIEW_ACTIONS flag is off",
    };
  }

  if (
    input.action === "add_note" ||
    input.action === "acknowledge_exception" ||
    input.action === "assign_investigation_owner" ||
    input.action === "view"
  ) {
    await appendP1865Audit({
      actor: input.actor,
      action: input.action,
      candidateId: input.candidateId,
      detail: input.note ?? input.investigationOwner ?? "note/ack",
      payload: { correlationId },
    });
    return {
      ok: true,
      action: input.action,
      correlationId,
      productionEventIds: [],
      shadowObservationTriggered: false,
      melQueueTouched: false,
      detail: "Non-mutating review action recorded",
    };
  }

  let workflowStatus: string | undefined;
  let note = input.note?.trim() || `P186.5 ${input.action} by ${input.actor}`;
  let forceWorkflowStatus = false;
  let enqueueMel = false;

  switch (input.action) {
    case "approve_onboarding_completion":
      workflowStatus = "Awaiting DD Verification";
      forceWorkflowStatus = true;
      break;
    case "reject_onboarding_completion":
    case "return_for_correction":
      workflowStatus = "Signed";
      forceWorkflowStatus = true;
      note = `[RETURN FOR CORRECTION] ${note}`;
      break;
    case "request_missing_documents":
      note = `[MISSING DOCS REQUESTED] ${note}`;
      break;
    case "place_onboarding_hold":
      note = `[ONBOARDING HOLD] ${note}`;
      break;
    case "clear_onboarding_hold":
      note = `[ONBOARDING HOLD CLEARED] ${note}`;
      break;
    case "approve_ready_for_mel":
      workflowStatus = "Ready for MEL";
      forceWorkflowStatus = true;
      enqueueMel = true;
      break;
    default:
      return {
        ok: false,
        action: input.action,
        correlationId,
        productionEventIds: [],
        shadowObservationTriggered: false,
        melQueueTouched: false,
        detail: "Unsupported action",
      };
  }

  try {
    const record = await upsert({
      candidateId: input.candidateId,
      workflowStatus: workflowStatus as never,
      forceWorkflowStatus,
      note,
      audit: {
        action: `p1865_${input.action}`,
        byUserId: input.actor,
        metadata: { correlationId, phase: "P186.5", melExport: false },
      },
    });

    await observe({
      candidateId: record.candidateId,
      workflowStatus: record.workflowStatus,
      paperworkStatus: record.paperworkStatus,
    }).catch(() => undefined);

    let melQueueTouched = false;
    if (enqueueMel) {
      const enq = await enqueueMelExportItem({
        candidateId: input.candidateId,
        jobOrProjectId: input.jobOrProjectId,
        onboardingAssignmentId: input.onboardingAssignmentId,
        approvalEventId: correlationId,
        approvedProductionStateRef: "Ready for MEL",
        status: "approved_for_export",
        forceFlags: { melExportQueue: flags.melExportQueue },
      });
      melQueueTouched = enq.ok;
      if (!enq.ok && enq.code !== "flag_off") {
        await appendP1865Audit({
          actor: input.actor,
          action: input.action,
          candidateId: input.candidateId,
          detail: `Production write ok; MEL queue: ${enq.reason}`,
          payload: { correlationId, code: enq.code },
        });
      }
    }

    const now = new Date().toISOString();
    await appendP1865Audit({
      actor: input.actor,
      action: input.action,
      candidateId: input.candidateId,
      detail: `Production write ok; observe triggered`,
      payload: { correlationId, melQueueTouched },
    });

    return {
      ok: true,
      action: input.action,
      correlationId,
      productionEventIds: [`wf:${input.candidateId}:${now}`],
      shadowObservationTriggered: true,
      melQueueTouched,
      detail: "Production approval persisted; shadow observe triggered; no MEL write API",
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await appendP1865Audit({
      actor: input.actor,
      action: input.action,
      candidateId: input.candidateId,
      detail: reason,
      payload: { correlationId, failed: true },
    });
    return {
      ok: false,
      action: input.action,
      correlationId,
      productionEventIds: [],
      shadowObservationTriggered: false,
      melQueueTouched: false,
      detail: `Production write failed — no shadow mutation: ${reason}`,
    };
  }
}
