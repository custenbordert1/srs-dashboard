import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import {
  addOperatorNote,
  buildRedactedExport,
  canPerformAction,
  executeBulkAction,
  executeConflictReviewAction,
  executeOperatorApprovalAction,
  previewBulkAction,
  readP1863Flags,
  toProductRole,
  type P1863OperatorAction,
} from "@/lib/p186-3-operator-lifecycle-queues";
import type { P1863SourceRow } from "@/lib/p186-3-operator-lifecycle-queues/queues";
import { workflowsToP1863Source } from "@/lib/p186-3-operator-lifecycle-queues/workflowAdapter";
import { LifecycleRecordStore } from "@/lib/p186-1-lifecycle-state-machine";
import { workflowToSourceRow } from "@/lib/p186-3-operator-lifecycle-queues/dashboard";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/p186-operator-queues/actions";

type Body = {
  action: P1863OperatorAction;
  candidateIds?: string[];
  note?: string;
  label?: string;
  confirmed?: boolean;
  mode?: "preview" | "execute";
  asOperator?: boolean;
  investigationOwner?: string;
};

async function resolveRows(candidateIds: string[]): Promise<P1863SourceRow[]> {
  const bundle = await getCandidateWorkflowBundle();
  const workflows = workflowsToP1863Source(bundle.workflows);
  const byId = new Map(workflows.map((w) => [w.candidateId, w]));
  const store = new LifecycleRecordStore();
  const rows: P1863SourceRow[] = [];
  for (const id of candidateIds) {
    const wf = byId.get(id) ?? { candidateId: id };
    const shadow = await store.get(id);
    rows.push(workflowToSourceRow(wf, shadow));
  }
  return rows;
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p186_operator_queues_actions",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP1863Flags();
  if (!flags.operatorDashboard) {
    return NextResponse.json(
      { ok: false, error: "P186 operator dashboard flag is off" },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const role = toProductRole(guard.session.role, Boolean(body.asOperator));
  if (!canPerformAction(role, body.action)) {
    return NextResponse.json(
      { ok: false, error: `Role ${role} cannot perform ${body.action}` },
      { status: 403 },
    );
  }

  const candidateIds = (body.candidateIds ?? []).map((id) => id.trim()).filter(Boolean);
  const actor = guard.session.userId ?? guard.session.email ?? "unknown";

  if (body.action === "add_note" || body.action === "assign_review_label") {
    if (!candidateIds.length) {
      return NextResponse.json({ ok: false, error: "candidateIds required" }, { status: 400 });
    }
    for (const id of candidateIds) {
      await addOperatorNote({
        candidateId: id,
        actor,
        note: body.note?.trim() || "Operator note",
        label: body.label ?? (body.action === "assign_review_label" ? "review_label" : null),
      });
    }
    return NextResponse.json({
      ok: true,
      detail: "Note/label saved (no lifecycle mutation)",
      candidateIds,
    });
  }

  if (body.action === "export_redacted") {
    const rows = await resolveRows(candidateIds);
    const { buildQueueItem } = await import("@/lib/p186-3-operator-lifecycle-queues/queues");
    const items = rows.map((r) => buildQueueItem(r));
    const exported = buildRedactedExport(items);
    return NextResponse.json(exported);
  }

  if (
    body.action === "acknowledge_conflict" ||
    body.action === "request_reconciliation" ||
    body.action === "assign_investigation_owner" ||
    body.action === "mark_conflict_reviewed"
  ) {
    const result = await executeConflictReviewAction({
      action: body.action,
      candidateIds,
      actor,
      role,
      note: body.note,
      investigationOwner: body.investigationOwner,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (!candidateIds.length) {
    return NextResponse.json({ ok: false, error: "candidateIds required" }, { status: 400 });
  }

  const rows = await resolveRows(candidateIds);
  const operatorAuthorized = role === "operator" || role === "executive";

  if (body.mode === "preview" || (candidateIds.length > 1 && !body.confirmed)) {
    const preview = previewBulkAction({
      action: body.action,
      rows,
      operatorAuthorized,
    });
    return NextResponse.json({ ok: true, preview });
  }

  if (candidateIds.length > 1) {
    const result = await executeBulkAction({
      action: body.action,
      rows,
      actor,
      role,
      operatorAuthorized,
      confirmed: Boolean(body.confirmed),
      note: body.note,
    });
    return NextResponse.json(result, { status: result.ok || result.succeeded.length ? 200 : 400 });
  }

  const result = await executeOperatorApprovalAction({
    action: body.action,
    row: rows[0]!,
    actor,
    role,
    operatorAuthorized,
    note: body.note,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
