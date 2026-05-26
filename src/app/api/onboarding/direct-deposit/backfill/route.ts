import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildDirectDepositBackfillQueue,
  DIRECT_DEPOSIT_BACKFILL_WINDOW_MS,
} from "@/lib/direct-deposit-backfill";
import { requestDirectDepositManualBackfill } from "@/lib/direct-deposit-workflow";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { getDirectDepositHrCopyConfig } from "@/lib/direct-deposit-email-config";
import { getTransactionalEmailMode } from "@/lib/transactional-email";
import { publishWorkflowRealtime } from "@/lib/workflow-realtime-push";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;

  const bundle = await getCandidateWorkflowBundle();
  const rows = await buildDirectDepositBackfillQueue(bundle.workflows);
  const windowHours = Math.round(DIRECT_DEPOSIT_BACKFILL_WINDOW_MS / (60 * 60 * 1000));

  const hrCopy = getDirectDepositHrCopyConfig();

  return NextResponse.json({
    ok: true,
    rows,
    windowHours,
    deliveryMode: getTransactionalEmailMode(),
    hrCopy,
    updatedAt: bundle.updatedAt,
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflow_action",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const action = typeof input.action === "string" ? input.action.trim() : "";
  const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
  const candidateEmail =
    typeof input.candidateEmail === "string" ? input.candidateEmail.trim() : undefined;
  const candidateIds = Array.isArray(input.candidateIds)
    ? input.candidateIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  if (action === "send") {
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: "candidateId is required." }, { status: 400 });
    }
    try {
      const result = await requestDirectDepositManualBackfill({
        candidateId,
        recipientEmail: candidateEmail,
        byUserId: session.userId,
      });
      publishWorkflowRealtime({
        candidateId,
        workflow: result.workflow,
        source: "direct_deposit_api",
        eventType: "backfill-send",
      });
      const bundle = await getCandidateWorkflowBundle();
      return NextResponse.json({
        ok: true,
        workflow: result.workflow,
        workflows: bundle.workflows,
        rosters: bundle.rosters,
        updatedAt: bundle.updatedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backfill send failed.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  }

  if (action === "send-bulk") {
    if (candidateIds.length === 0) {
      return NextResponse.json({ ok: false, error: "candidateIds is required." }, { status: 400 });
    }
    const results: Array<{ candidateId: string; ok: boolean; error?: string }> = [];
    for (const id of candidateIds) {
      try {
        const result = await requestDirectDepositManualBackfill({
          candidateId: id.trim(),
          byUserId: session.userId,
        });
        publishWorkflowRealtime({
          candidateId: id.trim(),
          workflow: result.workflow,
          source: "direct_deposit_api",
          eventType: "backfill-send",
        });
        results.push({ candidateId: id.trim(), ok: true });
      } catch (error) {
        results.push({
          candidateId: id.trim(),
          ok: false,
          error: error instanceof Error ? error.message : "Send failed",
        });
      }
    }
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: "direct_deposit_backfill_bulk",
      metadata: { count: candidateIds.length, ok: results.filter((r) => r.ok).length },
    });
    const bundle = await getCandidateWorkflowBundle();
    return NextResponse.json({
      ok: true,
      results,
      workflows: bundle.workflows,
      rosters: bundle.rosters,
      updatedAt: bundle.updatedAt,
    });
  }

  return NextResponse.json({ ok: false, error: "action is invalid." }, { status: 400 });
}
