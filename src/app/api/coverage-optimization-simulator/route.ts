import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import {
  listExecutiveAlertActionLogs,
  listExecutiveAlertFollowUps,
  listExecutiveAlertStatusOverlays,
} from "@/lib/alerts/executive-alert-status-store";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import {
  assertBreezyConfigured,
  logBreezyRouteResult,
  logBreezyRouteStart,
} from "@/lib/breezy-route-log";
import {
  buildCoverageOptimizationSimulatorSnapshot,
  type SimulatorScenarioKind,
} from "@/lib/coverage-optimization-simulator";
import { loadRecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/coverage-optimization-simulator";
const SCENARIO_KINDS = new Set<SimulatorScenarioKind>([
  "increase-pay",
  "expand-radius",
  "add-recruiter",
  "add-budget",
  "re-engage-candidates",
  "territory-blitz",
  "refresh-job-postings",
]);

async function loadSnapshotContext(session: ReturnType<typeof refreshSessionTerritories>, request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("forceRefresh") === "1";
  const requestedRecruiter = url.searchParams.get("recruiter")?.trim() || null;
  const requestedTerritoryId = url.searchParams.get("territoryId")?.trim() || null;
  const scenarioParam = url.searchParams.get("scenario")?.trim() || null;
  const requestedScenarioKind =
    scenarioParam && SCENARIO_KINDS.has(scenarioParam as SimulatorScenarioKind)
      ? (scenarioParam as SimulatorScenarioKind)
      : null;

  const unscopedForAdmin = session.role === "admin" || session.role === "executive";

  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    forceRefresh,
    unscopedForAdmin,
    scopeRepsToTerritory: !unscopedForAdmin,
  });

  if (!loaded.ok) {
    return { ok: false as const, failure: loaded.failure };
  }

  const followUps = await listExecutiveAlertFollowUps();
  const statusOverlays = await listExecutiveAlertStatusOverlays(session.userId);
  const actionLogs = await listExecutiveAlertActionLogs();
  const snapshot = buildCoverageOptimizationSimulatorSnapshot({
    session,
    bundle: loaded.bundle,
    followUps,
    statusOverlays,
    actionLogs,
    requestedRecruiter,
    requestedTerritoryId,
    requestedScenarioKind,
  });

  return {
    ok: true as const,
    bundle: loaded.bundle,
    snapshot,
    requestedScenarioKind,
    requestedTerritoryId,
  };
}

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "admin", "dm", "recruiter"],
    requireTerritory: true,
    auditAction: "coverage_optimization_simulator_read",
  });
  if (isGuardFailure(guard)) return guard;
  const session = refreshSessionTerritories(guard.session);
  auditTerritoryAccess(session, ROUTE);

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const result = await loadSnapshotContext(session, request);
  if (!result.ok) {
    const status = breezyFailureHttpStatus(result.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(result.failure.failure), { status });
  }

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    scenarioCount: result.snapshot.scenarios.length,
    topRoiCount: result.snapshot.topRoiScenarios.length,
    scopedToTerritory: result.snapshot.scope.scopedToTerritory,
  });

  return NextResponse.json({
    ok: true,
    snapshot: result.snapshot,
    meta: {
      partialSync: result.bundle.candidatesResult.partial ?? false,
      refreshedAt: result.bundle.fetchedAt,
      intelligenceCache: result.bundle.intelligenceCache,
      scopedToTerritory: result.snapshot.scope.scopedToTerritory,
      scopedToRecruiter: result.snapshot.scope.scopedToRecruiter,
      requestedScenario: result.requestedScenarioKind,
      requestedTerritoryId: result.requestedTerritoryId,
    },
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "admin", "dm", "recruiter"],
    requireTerritory: true,
    auditAction: "coverage_optimization_simulator_simulate",
  });
  if (isGuardFailure(guard)) return guard;
  const session = refreshSessionTerritories(guard.session);
  auditTerritoryAccess(session, ROUTE);

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  let body: {
    scenario?: string;
    territoryId?: string;
    recruiter?: string;
    forceRefresh?: boolean;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const scenarioKind =
    body.scenario && SCENARIO_KINDS.has(body.scenario as SimulatorScenarioKind)
      ? (body.scenario as SimulatorScenarioKind)
      : null;
  if (!scenarioKind) {
    return NextResponse.json({ ok: false, error: "Missing or invalid scenario kind" }, { status: 400 });
  }

  const unscopedForAdmin = session.role === "admin" || session.role === "executive";
  const loaded = await loadRecruitingIntelligenceRouteBundle(session, {
    forceRefresh: body.forceRefresh === true,
    unscopedForAdmin,
    scopeRepsToTerritory: !unscopedForAdmin,
  });

  if (!loaded.ok) {
    const status = breezyFailureHttpStatus(loaded.failure.failure.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody(loaded.failure.failure), { status });
  }

  const followUps = await listExecutiveAlertFollowUps();
  const statusOverlays = await listExecutiveAlertStatusOverlays(session.userId);
  const actionLogs = await listExecutiveAlertActionLogs();
  const snapshot = buildCoverageOptimizationSimulatorSnapshot({
    session,
    bundle: loaded.bundle,
    followUps,
    statusOverlays,
    actionLogs,
    requestedRecruiter: body.recruiter?.trim() || null,
    requestedTerritoryId: body.territoryId?.trim() || null,
    requestedScenarioKind: scenarioKind,
  });

  const scenario = snapshot.scenarios[0] ?? null;

  logBreezyRouteResult(ROUTE, 200, {
    role: session.role,
    breezyOk: true,
    scenario: scenarioKind,
    territoryId: body.territoryId ?? null,
  });

  return NextResponse.json({
    ok: true,
    scenario,
    snapshot,
    meta: {
      partialSync: loaded.bundle.candidatesResult.partial ?? false,
      refreshedAt: loaded.bundle.fetchedAt,
      intelligenceCache: loaded.bundle.intelligenceCache,
    },
  });
}
