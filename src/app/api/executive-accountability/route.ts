import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildExecutiveAccountabilitySnapshot,
  loadExecutiveAccountabilityStore,
  saveExecutiveAccountabilityStore,
  updateExecutiveAction,
} from "@/lib/executive-accountability";
import type { ExecutiveActionStatus, OperationalEvidenceKind } from "@/lib/executive-accountability";
import { loadExecutiveRecruitingForecastForSession } from "@/lib/executive-recruiting-forecast/load-forecast-context";
import { loadPipelineIntelligenceForSession } from "@/lib/pipeline-intelligence/load-pipeline-intelligence-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive-accountability";

function actorLabel(session: { name?: string; email?: string; userId?: string }): string {
  return session.name?.trim() || session.email?.trim() || session.userId || "executive";
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "executive_accountability_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const [forecastResult, pipelineResult] = await Promise.all([
    loadExecutiveRecruitingForecastForSession(session),
    loadPipelineIntelligenceForSession(session),
  ]);
  if (!forecastResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: forecastResult.error,
        partial: forecastResult.partial,
      },
      { status: forecastResult.partial ? 200 : 503 },
    );
  }

  const store = await loadExecutiveAccountabilityStore();
  const { snapshot, store: updatedStore } = buildExecutiveAccountabilitySnapshot({
    forecast: forecastResult.forecast,
    workflows: forecastResult.workflows,
    pipelineRecommendations: pipelineResult.ok ? pipelineResult.snapshot.recommendations : [],
    store,
  });
  await saveExecutiveAccountabilityStore(updatedStore);

  return NextResponse.json(
    {
      ok: true,
      snapshot,
      meta: {
        partialSync: forecastResult.partialSync,
        melOk: forecastResult.melOk,
        syncStatus: forecastResult.syncStatus,
        refreshedAt: new Date().toISOString(),
      },
    },
    {
      headers: {
        "Cache-Control": "private, max-age=60, stale-while-revalidate=120",
      },
    },
  );
}

type PatchBody = {
  recommendationId?: string;
  status?: ExecutiveActionStatus;
  outcomeNotes?: string | null;
  actualOutcome?: string | null;
  appendNote?: string;
  owner?: string | null;
  dueDate?: string;
  operationalEvidenceKind?: OperationalEvidenceKind;
  operationalEvidenceDetail?: string | null;
};

export async function PATCH(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "executive_accountability_update",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.recommendationId?.trim()) {
    return NextResponse.json({ ok: false, error: "recommendationId is required" }, { status: 400 });
  }

  const outcomeNotes =
    body.outcomeNotes !== undefined ? body.outcomeNotes : body.actualOutcome;

  const { action, auditLog } = await updateExecutiveAction(
    body.recommendationId,
    {
      status: body.status,
      outcomeNotes,
      appendNote: body.appendNote,
      owner: body.owner,
      dueDate: body.dueDate,
      operationalEvidenceKind: body.operationalEvidenceKind,
      operationalEvidenceDetail: body.operationalEvidenceDetail,
    },
    { displayName: actorLabel(session) },
  );

  if (!action) {
    return NextResponse.json({ ok: false, error: "Action not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, action, auditLog });
}
