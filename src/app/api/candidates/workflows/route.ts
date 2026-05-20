import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { isCandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workflows_read",
  });
  if (isGuardFailure(guard)) return guard;

  const workflows = await getCandidateWorkflowState();
  return NextResponse.json({
    ok: true,
    workflows,
    count: Object.keys(workflows).length,
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
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
  const workflowStatus = typeof input.workflowStatus === "string" ? input.workflowStatus : undefined;
  const assignedRecruiter = typeof input.assignedRecruiter === "string" ? input.assignedRecruiter : undefined;
  const assignedDM = typeof input.assignedDM === "string" ? input.assignedDM : undefined;
  const note = typeof input.note === "string" ? input.note : undefined;

  if (!candidateId) {
    return NextResponse.json({ ok: false, error: "candidateId is required." }, { status: 400 });
  }
  if (workflowStatus !== undefined && !isCandidateWorkflowStatus(workflowStatus)) {
    return NextResponse.json({ ok: false, error: "workflowStatus is invalid." }, { status: 400 });
  }

  const workflow = await upsertCandidateWorkflow({
    candidateId,
    workflowStatus,
    assignedRecruiter,
    assignedDM,
    note,
  });

  auditFromSession(session, {
    action: "workflow_action",
    entityType: "workflow",
    entityId: candidateId,
    metadata: { workflowStatus, hasNote: Boolean(note) },
  });

  return NextResponse.json({ ok: true, workflow });
}
