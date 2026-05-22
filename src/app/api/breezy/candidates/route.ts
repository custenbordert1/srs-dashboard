import { logCandidatesDebug } from "@/lib/candidates-debug";
import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { guardBreezyCandidatesResult } from "@/lib/auth/breezy-territory-guard";
import { fetchBreezyCandidates, type BreezyCandidatesScanMode } from "@/lib/breezy-api";
import { withCandidatesFailureMeta } from "@/lib/breezy-candidates-sync";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { blockBreezyWriteRoute } from "@/lib/security/read-only";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/breezy/candidates";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "breezy_candidates_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json(
      withCandidatesFailureMeta(breezyCheck.error, new Date().toISOString()),
      { status: breezyCheck.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";
  const scanParam = searchParams.get("scan")?.trim().toLowerCase();
  const scanMode: BreezyCandidatesScanMode | undefined =
    scanParam === "preview" || scanParam === "fast" || scanParam === "full" || scanParam === "all"
      ? scanParam
      : undefined;
  const positionId = searchParams.get("position_id")?.trim() || undefined;
  const state = searchParams.get("state")?.trim() || undefined;
  const pageSize = Number.parseInt(searchParams.get("page_size") ?? "", 10);
  const maxPages = Number.parseInt(searchParams.get("max_pages") ?? "", 10);
  const maxPositions = Number.parseInt(searchParams.get("max_positions") ?? "", 10);
  const dateRangeStart =
    searchParams.get("from")?.trim() || searchParams.get("date_from")?.trim() || undefined;
  const dateRangeEnd =
    searchParams.get("to")?.trim() || searchParams.get("date_to")?.trim() || undefined;

  const breezyResult = await fetchBreezyCandidates({
      positionId,
      state,
      pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
      maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
      maxPositions: Number.isFinite(maxPositions) ? maxPositions : undefined,
      dateRangeStart,
      dateRangeEnd,
      force,
      scanMode,
    });
  if (breezyResult.ok) {
    logCandidatesDebug("before_api_territory_guard", breezyResult.candidates.length, {
      scanMode: scanMode ?? "default",
      role: session.role,
    });
  }
  const result = guardBreezyCandidatesResult(breezyResult, session);
  if (result.ok) {
    logCandidatesDebug("after_api_territory_guard", result.candidates.length, {
      scanMode: scanMode ?? "default",
      role: session.role,
      territoryFiltered: result.skippedCandidatesReason?.territoryFiltered ?? 0,
    });
  }
  const status = result.ok ? 200 : breezyFailureHttpStatus(result.error);
  logBreezyRouteResult(ROUTE, status, {
    role: session.role,
    scanMode: scanMode ?? "default",
    force,
    breezyOk: result.ok,
    candidateCount: result.ok ? result.candidates.length : 0,
    normalizedCandidateCount: result.ok ? result.candidates.length : 0,
    rawBreezyResponseCount: result.ok ? result.previewDiagnostics?.rawBreezyResponseCount : undefined,
    extractedCandidatesCount: result.ok ? result.previewDiagnostics?.extractedCandidatesCount : undefined,
    servedFromServerCache: result.ok ? result.previewDiagnostics?.servedFromServerCache : undefined,
    positionsScanned: result.ok ? result.positionsScanned : undefined,
    candidatesInDateRange: result.ok ? result.candidatesInDateRange : undefined,
    sanitizeRejected: result.ok ? result.skippedCandidatesReason?.sanitizeRejected : undefined,
    territoryFiltered: result.ok ? result.skippedCandidatesReason?.territoryFiltered : undefined,
    positionFetchFailed: result.ok ? result.skippedCandidatesReason?.positionFetchFailed : undefined,
  });
  return NextResponse.json(result, {
    status,
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
  });
  if (isGuardFailure(guard)) return guard;
  return blockBreezyWriteRoute(request, guard.session) ?? NextResponse.json({ ok: false }, { status: 405 });
}
