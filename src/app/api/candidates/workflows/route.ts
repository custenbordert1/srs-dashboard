import {
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { isCandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const workflows = await getCandidateWorkflowState();
  return NextResponse.json({
    ok: true,
    workflows,
    count: Object.keys(workflows).length,
  });
}

export async function POST(request: Request) {
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

  return NextResponse.json({ ok: true, workflow });
}
