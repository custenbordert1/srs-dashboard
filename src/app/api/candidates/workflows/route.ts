import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { isCandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import {
  addDmToServerRoster,
  addRecruiterToServerRoster,
  completeCandidateFollowUp,
  getCandidateWorkflowBundle,
  snoozeCandidateWorkflow,
  toggleCandidateRecruitingAction,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { isRecruitingActionType } from "@/lib/candidate-recruiting-actions-guard";
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

  const bundle = await getCandidateWorkflowBundle();
  return NextResponse.json({
    ok: true,
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    count: Object.keys(bundle.workflows).length,
    updatedAt: bundle.updatedAt,
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

  const rosterAction = typeof input.rosterAction === "string" ? input.rosterAction : "";
  if (rosterAction === "add-recruiter" || rosterAction === "add-dm") {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) {
      return NextResponse.json({ ok: false, error: "name is required for roster updates." }, { status: 400 });
    }
    const rosters =
      rosterAction === "add-recruiter"
        ? await addRecruiterToServerRoster(name)
        : await addDmToServerRoster(name);
    auditFromSession(session, {
      action: "workflow_roster",
      entityType: "workflow_roster",
      entityId: rosterAction,
      metadata: { name },
    });
    const bundle = await getCandidateWorkflowBundle();
    return NextResponse.json({
      ok: true,
      rosters,
      workflows: bundle.workflows,
      updatedAt: bundle.updatedAt,
    });
  }

  const recruitingAction =
    input.recruitingAction && typeof input.recruitingAction === "object"
      ? (input.recruitingAction as Record<string, unknown>)
      : null;
  if (recruitingAction) {
    const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
    const type = typeof recruitingAction.type === "string" ? recruitingAction.type : "";
    const enabled =
      typeof recruitingAction.enabled === "boolean" ? recruitingAction.enabled : undefined;
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: "candidateId is required." }, { status: 400 });
    }
    if (!isRecruitingActionType(type)) {
      return NextResponse.json({ ok: false, error: "recruitingAction.type is invalid." }, { status: 400 });
    }
    const workflow = await toggleCandidateRecruitingAction({
      candidateId,
      type,
      enabled,
      byUserId: session.userId,
    });
    auditFromSession(session, {
      action: "workflow_action",
      entityType: "workflow",
      entityId: candidateId,
      metadata: { recruitingActionType: type },
    });
    const bundle = await getCandidateWorkflowBundle();
    return NextResponse.json({
      ok: true,
      workflow,
      workflows: bundle.workflows,
      rosters: bundle.rosters,
      updatedAt: bundle.updatedAt,
    });
  }

  const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
  const queueAction = typeof input.queueAction === "string" ? input.queueAction : "";

  if (queueAction) {
    if (!candidateId) {
      return NextResponse.json({ ok: false, error: "candidateId is required." }, { status: 400 });
    }
    let workflow;
    if (queueAction === "complete-follow-up") {
      workflow = await completeCandidateFollowUp({ candidateId, byUserId: session.userId });
    } else if (queueAction === "snooze-24h") {
      workflow = await snoozeCandidateWorkflow({ candidateId, byUserId: session.userId });
    } else {
      return NextResponse.json({ ok: false, error: "queueAction is invalid." }, { status: 400 });
    }
    const bundle = await getCandidateWorkflowBundle();
    return NextResponse.json({
      ok: true,
      workflow,
      workflows: bundle.workflows,
      rosters: bundle.rosters,
      updatedAt: bundle.updatedAt,
    });
  }

  const workflowStatus = typeof input.workflowStatus === "string" ? input.workflowStatus : undefined;
  const assignedRecruiter = typeof input.assignedRecruiter === "string" ? input.assignedRecruiter : undefined;
  const assignedDM = typeof input.assignedDM === "string" ? input.assignedDM : undefined;
  const note = typeof input.note === "string" ? input.note : undefined;
  const followUpDueAt =
    input.followUpDueAt === null
      ? null
      : typeof input.followUpDueAt === "string"
        ? input.followUpDueAt
        : undefined;
  const snoozedUntil =
    input.snoozedUntil === null
      ? null
      : typeof input.snoozedUntil === "string"
        ? input.snoozedUntil
        : undefined;

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
    followUpDueAt,
    snoozedUntil,
    audit: {
      action: assignedRecruiter ? "assign_recruiter" : assignedDM ? "assign_dm" : "upsert_workflow",
      byUserId: session.userId,
      metadata: {
        workflowStatus: workflowStatus ?? "",
        hasNote: Boolean(note),
        assignedRecruiter: assignedRecruiter ?? "",
        assignedDM: assignedDM ?? "",
      },
    },
  });

  auditFromSession(session, {
    action: "workflow_action",
    entityType: "workflow",
    entityId: candidateId,
    metadata: {
      workflowStatus: workflowStatus ?? "",
      hasNote: Boolean(note),
      assignedRecruiter: assignedRecruiter ?? "",
      assignedDM: assignedDM ?? "",
      assignmentType: assignedRecruiter ? "recruiter" : assignedDM ? "dm" : "",
    },
  });

  const bundle = await getCandidateWorkflowBundle();
  return NextResponse.json({
    ok: true,
    workflow,
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    updatedAt: bundle.updatedAt,
  });
}
