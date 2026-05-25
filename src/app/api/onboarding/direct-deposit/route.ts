import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  markDirectDepositApproved,
  markDirectDepositReceived,
  resendDirectDepositVerificationEmail,
  updateDirectDepositNotes,
} from "@/lib/direct-deposit-workflow";
import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { publishWorkflowRealtime } from "@/lib/workflow-realtime-push";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["resend", "mark-received", "mark-approved", "set-notes"]);

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
  const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
  const action = typeof input.action === "string" ? input.action.trim() : "";
  const candidateEmail =
    typeof input.candidateEmail === "string" ? input.candidateEmail.trim() : undefined;
  const notes = typeof input.notes === "string" ? input.notes : undefined;

  if (!candidateId) {
    return NextResponse.json({ ok: false, error: "candidateId is required." }, { status: 400 });
  }
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: "action is invalid." }, { status: 400 });
  }

  try {
    let workflow;
    if (action === "resend") {
      const result = await resendDirectDepositVerificationEmail({
        candidateId,
        recipientEmail: candidateEmail,
        byUserId: session.userId,
      });
      workflow = result.workflow;
    } else if (action === "mark-received") {
      workflow = await markDirectDepositReceived({ candidateId, byUserId: session.userId });
    } else if (action === "mark-approved") {
      workflow = await markDirectDepositApproved({ candidateId, byUserId: session.userId });
    } else {
      if (notes === undefined) {
        return NextResponse.json({ ok: false, error: "notes is required for set-notes." }, { status: 400 });
      }
      workflow = await updateDirectDepositNotes({
        candidateId,
        notes,
        byUserId: session.userId,
      });
    }

    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: candidateId,
      metadata: { action },
    });

    publishWorkflowRealtime({
      candidateId,
      workflow,
      source: "direct_deposit_api",
      eventType: action,
    });

    const bundle = await getCandidateWorkflowBundle();
    return NextResponse.json({
      ok: true,
      workflow,
      workflows: bundle.workflows,
      rosters: bundle.rosters,
      updatedAt: bundle.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Direct deposit action failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
