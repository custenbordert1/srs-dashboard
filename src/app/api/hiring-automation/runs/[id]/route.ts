import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import {
  buildControlCenterSnapshot,
  executeAutomationRun,
  getAutomationRun,
  listAutomationRuns,
} from "@/lib/hiring-automation-engine";
import {
  approveAutomationRun,
  rejectAutomationRun,
} from "@/lib/hiring-automation-engine/automation-run-store";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { applyTerritoryToCandidates } from "@/lib/auth/territory-filter";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const guard = guardApiRoute(new Request("http://local"), {
    allowedRoles: ["executive", "recruiter", "dm"],
  });
  if (isGuardFailure(guard)) return guard;

  const { id } = await context.params;
  const run = await getAutomationRun(id);
  if (!run) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, run });
}

export async function POST(request: Request, context: RouteContext) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "hiring_automation_action",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = (body as { action?: string }).action;

  if (action === "approve") {
    const run = await approveAutomationRun(id, session.userId);
    if (!run) return NextResponse.json({ ok: false, error: "Cannot approve run." }, { status: 400 });
    return NextResponse.json({ ok: true, run, snapshot: buildControlCenterSnapshot(await listAutomationRuns()) });
  }

  if (action === "reject") {
    const run = await rejectAutomationRun(id, session.userId);
    if (!run) return NextResponse.json({ ok: false, error: "Cannot reject run." }, { status: 400 });
    return NextResponse.json({ ok: true, run, snapshot: buildControlCenterSnapshot(await listAutomationRuns()) });
  }

  if (action === "execute") {
    const run = await getAutomationRun(id);
    if (!run) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

    let row;
    if (run.candidateId) {
      const [candidatesResult, workflows] = await Promise.all([
        fetchBreezyCandidates(),
        getCandidateWorkflowState(),
      ]);
      if (candidatesResult.ok) {
        const candidates = applyTerritoryToCandidates(session, candidatesResult.candidates);
        const breezy = candidates.find((c) => c.candidateId === run.candidateId);
        if (breezy) {
          row = buildScoredWorkflowRow(breezy, workflows[run.candidateId]);
        }
      }
    }

    const result = await executeAutomationRun({
      runId: id,
      row,
      actor: session.userId,
    });

    return NextResponse.json({
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      run: result.run,
      summary: result.ok ? result.summary : undefined,
      snapshot: buildControlCenterSnapshot(await listAutomationRuns()),
    }, { status: result.ok ? 200 : 400 });
  }

  return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
}
