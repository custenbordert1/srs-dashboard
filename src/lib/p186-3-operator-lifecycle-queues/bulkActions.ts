import { randomUUID } from "node:crypto";
import {
  executeOperatorApprovalAction,
  type ApprovalDeps,
} from "@/lib/p186-3-operator-lifecycle-queues/approvalActions";
import { appendOperatorAudit } from "@/lib/p186-3-operator-lifecycle-queues/audit";
import { readBulkLimit, readP1863Flags } from "@/lib/p186-3-operator-lifecycle-queues/flags";
import {
  evaluateApprovalGates,
  expectedStatesForAction,
} from "@/lib/p186-3-operator-lifecycle-queues/gates";
import type { P1863SourceRow } from "@/lib/p186-3-operator-lifecycle-queues/queues";
import { isProductionWriteAction } from "@/lib/p186-3-operator-lifecycle-queues/rbac";
import type {
  P1863ActionResult,
  P1863BulkPreview,
  P1863OperatorAction,
} from "@/lib/p186-3-operator-lifecycle-queues/types";

const BULK_ALLOWED: ReadonlySet<P1863OperatorAction> = new Set([
  "approve_hiring_recommendation",
  "return_to_recruiter",
  "place_hold",
  "remove_hold",
  "add_note",
  "assign_review_label",
  "export_redacted",
]);

export function previewBulkAction(input: {
  action: P1863OperatorAction;
  rows: P1863SourceRow[];
  operatorAuthorized: boolean;
  batchLimit?: number;
}): P1863BulkPreview {
  const limit = input.batchLimit ?? readBulkLimit();
  const truncated = input.rows.length > limit;
  const slice = input.rows.slice(0, limit);
  const eligible: P1863BulkPreview["eligible"] = [];
  const blocked: P1863BulkPreview["blocked"] = [];

  if (!BULK_ALLOWED.has(input.action)) {
    return {
      action: input.action,
      requestedCount: input.rows.length,
      eligible: [],
      blocked: input.rows.map((r) => ({
        candidateId: r.candidateId,
        reason: "Action not allowed for bulk",
      })),
      batchLimit: limit,
      truncated,
    };
  }

  for (const row of slice) {
    if (!isProductionWriteAction(input.action) && input.action !== "add_note" && input.action !== "assign_review_label" && input.action !== "export_redacted") {
      blocked.push({ candidateId: row.candidateId, reason: "Unsupported bulk action" });
      continue;
    }
    if (input.action === "add_note" || input.action === "assign_review_label" || input.action === "export_redacted") {
      eligible.push({ candidateId: row.candidateId, reason: "Read-safe / note action" });
      continue;
    }
    const gates = evaluateApprovalGates({
      action: input.action,
      row,
      expectedProductionStates: expectedStatesForAction(input.action),
      operatorAuthorized: input.operatorAuthorized,
    });
    if (!gates.ok) {
      blocked.push({
        candidateId: row.candidateId,
        reason: gates.failures.map((f) => f.message).join("; "),
      });
    } else {
      eligible.push({ candidateId: row.candidateId, reason: "Gates passed" });
    }
  }

  return {
    action: input.action,
    requestedCount: input.rows.length,
    eligible,
    blocked,
    batchLimit: limit,
    truncated,
  };
}

export async function executeBulkAction(input: {
  action: P1863OperatorAction;
  rows: P1863SourceRow[];
  actor: string;
  role: string;
  operatorAuthorized: boolean;
  confirmed: boolean;
  note?: string;
  forceFlags?: { bulkActions: boolean; approvalActions: boolean };
  deps?: ApprovalDeps;
}): Promise<P1863ActionResult> {
  const flags = readP1863Flags(
    input.forceFlags
      ? {
          bulkActions: input.forceFlags.bulkActions,
          approvalActions: input.forceFlags.approvalActions,
        }
      : undefined,
  );
  const correlationId = `p1863-bulk-${randomUUID().slice(0, 10)}`;

  if (!flags.bulkActions) {
    return {
      ok: false,
      action: input.action,
      correlationId,
      succeeded: [],
      failed: input.rows.map((r) => ({
        candidateId: r.candidateId,
        reason: "P186_BULK_ACTIONS flag is off",
      })),
      productionEventIds: [],
      shadowObservationTriggered: false,
      detail: "Bulk actions disabled",
    };
  }
  if (!input.confirmed) {
    return {
      ok: false,
      action: input.action,
      correlationId,
      succeeded: [],
      failed: input.rows.map((r) => ({
        candidateId: r.candidateId,
        reason: "Confirmation required",
      })),
      productionEventIds: [],
      shadowObservationTriggered: false,
      detail: "Bulk confirmation screen required",
    };
  }

  const preview = previewBulkAction({
    action: input.action,
    rows: input.rows,
    operatorAuthorized: input.operatorAuthorized,
  });

  const succeeded: string[] = [];
  const failed: Array<{ candidateId: string; reason: string }> = [...preview.blocked];
  const productionEventIds: string[] = [];
  let shadowObservationTriggered = false;

  if (input.action === "export_redacted" || input.action === "add_note" || input.action === "assign_review_label") {
    for (const e of preview.eligible) {
      succeeded.push(e.candidateId);
    }
    await appendOperatorAudit({
      actor: input.actor,
      role: input.role,
      action: input.action,
      candidateIds: input.rows.map((r) => r.candidateId),
      correlationId,
      ok: true,
      detail: `Bulk ${input.action} (no production lifecycle mutation)`,
      succeeded,
      failed,
      preview: preview,
    });
    return {
      ok: failed.length === 0,
      action: input.action,
      correlationId,
      succeeded,
      failed,
      productionEventIds: [],
      shadowObservationTriggered: false,
      detail: "Bulk non-mutating action complete",
    };
  }

  const byId = new Map(input.rows.map((r) => [r.candidateId, r]));
  for (const e of preview.eligible) {
    const row = byId.get(e.candidateId);
    if (!row) continue;
    const result = await executeOperatorApprovalAction({
      action: input.action,
      row,
      actor: input.actor,
      role: input.role,
      operatorAuthorized: input.operatorAuthorized,
      note: input.note,
      forceFlags: { approvalActions: true },
      deps: input.deps,
    });
    if (result.ok) {
      succeeded.push(...result.succeeded);
      productionEventIds.push(...result.productionEventIds);
      shadowObservationTriggered = shadowObservationTriggered || result.shadowObservationTriggered;
    } else {
      failed.push(...result.failed);
    }
  }

  await appendOperatorAudit({
    actor: input.actor,
    role: input.role,
    action: input.action,
    candidateIds: input.rows.map((r) => r.candidateId),
    correlationId,
    ok: succeeded.length > 0,
    detail: `Bulk partial/complete success=${succeeded.length} failed=${failed.length}`,
    succeeded,
    failed,
    productionEventIds,
    preview,
  });

  return {
    ok: succeeded.length > 0 && failed.length === 0,
    action: input.action,
    correlationId,
    succeeded,
    failed,
    productionEventIds,
    shadowObservationTriggered,
    detail:
      failed.length === 0
        ? "Bulk action complete"
        : `Partial success: ${succeeded.length} ok, ${failed.length} failed. Rollback: reverse individual workflow notes/status via existing audit tools where available.`,
  };
}
