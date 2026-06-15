import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { buildExecutiveOperationsCenterSnapshot } from "@/lib/executive-operations-center";
import { loadRecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { buildWorkforceOpsCenterSnapshot } from "@/lib/workforce-ops-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/executive-operations-center";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive"],
    auditAction: "executive_operations_center_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const forceRefresh = new URL(request.url).searchParams.get("forceRefresh") === "1";
  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    forceRefresh,
    unscopedForAdmin: true,
    scopeRepsToTerritory: false,
  });

  if (!loaded.ok) {
    const status = breezyFailureHttpStatus(loaded.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(loaded.failure.failure), { status });
  }

  const { bundle } = loaded;
  const workforce = buildWorkforceOpsCenterSnapshot({
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    opportunities: bundle.opportunities,
    activeReps: bundle.activeReps,
  });

  const center = buildExecutiveOperationsCenterSnapshot({
    jobs: bundle.jobs,
    candidates: bundle.candidates,
    workflows: bundle.workflows,
    fetchedAt: bundle.fetchedAt,
    coverage: bundle.coverage,
    opportunities: bundle.opportunities,
    activeReps: bundle.activeReps,
    workforceQueue: workforce.operationsQueue,
  });

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    healthScore: center.companyHealth.score,
  });

  return NextResponse.json({
    ok: true,
    center,
    meta: {
      partialSync: bundle.candidatesResult.partial ?? false,
      hasCoverageData: bundle.opportunities.length > 0,
      refreshedAt: bundle.fetchedAt,
      manualOnly: true,
      intelligenceCache: bundle.intelligenceCache,
    },
  });
}
