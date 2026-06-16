import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { assertBreezyConfigured } from "@/lib/breezy-route-log";
import { ExecutiveRouteTimer } from "@/lib/executive-routes/executive-route-profiling";
import { loadExecutiveIntelligenceBundle } from "@/lib/executive-routes/executive-intelligence-route";
import { extractOutcomeMetrics } from "@/lib/recommendation-intelligence/metrics";
import {
  executeRecommendationRecord,
  listRecommendationRecords,
  markRecommendationExecuted,
} from "@/lib/recommendation-intelligence/store";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recommendation-intelligence/execute";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "recommendation_intelligence_execute",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  let body: {
    recommendationId?: string;
    owner?: string;
    ownerKind?: "dm" | "recruiter" | "operations";
    markExecuted?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const recommendationId = body.recommendationId?.trim() ?? "";
  if (!recommendationId) {
    return NextResponse.json({ ok: false, error: "recommendationId is required" }, { status: 400 });
  }

  const owner = body.owner?.trim() || session.name || session.email;
  const timer = new ExecutiveRouteTimer(ROUTE);
  const bundleResult = await loadExecutiveIntelligenceBundle(request, session, ROUTE, timer, {
    unscopedForAdmin: session.role === "admin" || session.role === "executive",
    scopeRepsToTerritory: session.role !== "admin" && session.role !== "executive",
  });

  const existing = (await listRecommendationRecords()).find(
    (row) => row.recommendationId === recommendationId,
  );
  const scope = existing?.scope ?? {
    territory: null,
    recruiter: body.ownerKind === "recruiter" ? owner : null,
    project: null,
    dmName: body.ownerKind === "dm" ? owner : null,
    entityId: recommendationId,
    entityType: null,
  };
  const baselineMetrics = extractOutcomeMetrics(bundleResult.bundle, scope);

  const record = await executeRecommendationRecord(session, {
    recommendationId,
    owner,
    ownerKind: body.ownerKind,
    baselineMetrics,
  });

  if (!record) {
    return NextResponse.json({ ok: false, error: "Recommendation not found" }, { status: 404 });
  }

  const finalRecord = body.markExecuted
    ? (await markRecommendationExecuted(recommendationId)) ?? record
    : record;

  return NextResponse.json({
    ok: true,
    record: finalRecord,
    meta: {
      servedFromCache: bundleResult.servedFromCache,
      timedOut: bundleResult.timedOut,
    },
  });
}
