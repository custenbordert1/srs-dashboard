import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { loadRecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildWorkforceOpsCenterSnapshot } from "@/lib/workforce-ops-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/workforce-ops";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "workforce_ops_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const territoryStates = filterStatesForSession(session) ?? undefined;
  const forceRefresh = new URL(request.url).searchParams.get("forceRefresh") === "1";

  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    forceRefresh,
    territoryStates,
    scopeRepsToTerritory: true,
  });

  if (!loaded.ok) {
    const status = breezyFailureHttpStatus(loaded.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(loaded.failure.failure), { status });
  }

  const { bundle } = loaded;
  const center = buildWorkforceOpsCenterSnapshot({
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    opportunities: bundle.opportunities,
    activeReps: bundle.activeReps,
    coverage: bundle.melOk ? bundle.coverage : null,
    fetchedAt: bundle.fetchedAt,
    territoryStates,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    pipelineItems: center.melPipeline.length,
  });

  return NextResponse.json({
    ok: true,
    center,
    meta: {
      partialSync: bundle.candidatesResult.truncated ?? false,
      scanMode: bundle.candidatesResult.scanMode ?? "fast",
      hasMelData: bundle.melOk,
      refreshedAt: bundle.fetchedAt,
      intelligenceCache: bundle.intelligenceCache,
    },
  });
}
