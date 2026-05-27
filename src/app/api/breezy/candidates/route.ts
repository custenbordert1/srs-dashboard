import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { guardBreezyCandidatesResult } from "@/lib/auth/breezy-territory-guard";
import { fetchBreezyCandidates, type BreezyCandidatesScanMode } from "@/lib/breezy-api";
import { withCandidatesFailureMeta } from "@/lib/breezy-candidates-sync";
import {
  isBreezyCandidatesTimeoutMessage,
  logBreezyCandidatesExtract,
  logBreezyCandidatesOps,
} from "@/lib/breezy-candidates-ops-log";
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
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
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
  const positionsOffset = Number.parseInt(searchParams.get("positions_offset") ?? "", 10);
  const hydrationOwnerId = searchParams.get("hydration_owner")?.trim() || undefined;
  const reclaimStale = searchParams.get("reclaim_stale") === "true";
  const dateRangeStart =
    searchParams.get("from")?.trim() || searchParams.get("date_from")?.trim() || undefined;
  const dateRangeEnd =
    searchParams.get("to")?.trim() || searchParams.get("date_to")?.trim() || undefined;

  logBreezyCandidatesOps("server", "request_start", {
    route: ROUTE,
    role: session.role,
    scanMode: scanMode ?? "default",
    force,
    positionId: positionId ?? null,
    state: state ?? null,
  });

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
      positionsOffset: Number.isFinite(positionsOffset) ? positionsOffset : undefined,
      hydrationOwnerId,
      reclaimStale,
    });
  const result = guardBreezyCandidatesResult(breezyResult, session);
  const status = result.ok ? 200 : breezyFailureHttpStatus(result.error);

  if (result.ok && result.stale && result.fromCache) {
    logBreezyCandidatesOps("server", "fallback", {
      route: ROUTE,
      scanMode: scanMode ?? result.scanMode ?? "default",
      fallbackSource: "server_stale_snapshot",
      candidateCount: result.candidates.length,
      refreshError: result.refreshError ?? null,
    });
  } else if (result.ok && result.candidates.length > 0) {
    logBreezyCandidatesOps("server", "success", {
      route: ROUTE,
      scanMode: scanMode ?? result.scanMode ?? "default",
      candidateCount: result.candidates.length,
      fromCache: result.fromCache ?? false,
      partial: result.partial ?? false,
    });
  } else if (result.ok) {
    logBreezyCandidatesOps("server", "empty", {
      route: ROUTE,
      scanMode: scanMode ?? result.scanMode ?? "default",
      positionsScanned: result.positionsScanned ?? 0,
    });
  } else if (isBreezyCandidatesTimeoutMessage(result.error)) {
    logBreezyCandidatesOps("server", "timeout", {
      route: ROUTE,
      scanMode: scanMode ?? "default",
      error: result.error,
    });
  } else {
    logBreezyCandidatesOps("server", "error", {
      route: ROUTE,
      scanMode: scanMode ?? "default",
      httpStatus: status,
      error: result.error,
    });
  }

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
    previewStoppedReason: result.ok ? result.previewDiagnostics?.previewStoppedReason : undefined,
    previewCandidatePositionsFound: result.ok
      ? result.previewDiagnostics?.previewCandidatePositionsFound
      : undefined,
    previewEmptyPositions: result.ok ? result.previewDiagnostics?.previewEmptyPositions : undefined,
    positionsScanned: result.ok ? result.positionsScanned : undefined,
    candidatesInDateRange: result.ok ? result.candidatesInDateRange : undefined,
    sanitizeRejected: result.ok ? result.skippedCandidatesReason?.sanitizeRejected : undefined,
    territoryFiltered: result.ok ? result.skippedCandidatesReason?.territoryFiltered : undefined,
    positionFetchFailed: result.ok ? result.skippedCandidatesReason?.positionFetchFailed : undefined,
  });
  const cacheMaxAge =
    result.ok && result.candidates.length > 0 && (scanMode === "preview" || scanMode === "fast")
      ? 300
      : 30;

  logBreezyCandidatesExtract("final_json_to_browser", {
    route: ROUTE,
    httpStatus: status,
    scanMode: scanMode ?? (result.ok ? (result.scanMode ?? "default") : "default"),
    ok: result.ok,
    candidateCount: result.ok ? result.candidates.length : 0,
    rawBreezyResponseCount: result.ok ? result.previewDiagnostics?.rawBreezyResponseCount ?? null : null,
    extractedCandidatesCount: result.ok ? result.previewDiagnostics?.extractedCandidatesCount ?? null : null,
    positionsScanned: result.ok ? result.positionsScanned ?? null : null,
    totalPositionsAvailable: result.ok ? result.totalPositionsAvailable ?? null : null,
    previewStoppedReason: result.ok ? result.previewDiagnostics?.previewStoppedReason ?? null : null,
    previewEmptyPositions: result.ok ? result.previewDiagnostics?.previewEmptyPositions ?? null : null,
    candidateFetchEndpoint: result.ok ? result.candidateFetchEndpoint ?? null : null,
    fromCache: result.ok ? result.fromCache ?? false : null,
    error: result.ok ? null : result.error,
  });

  return NextResponse.json(result, {
    status,
    headers: {
      "Cache-Control": `private, max-age=${cacheMaxAge}, stale-while-revalidate=120`,
    },
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter", "dm"],
    requireTerritory: true,
  });
  if (isGuardFailure(guard)) return guard;
  return blockBreezyWriteRoute(request, guard.session) ?? NextResponse.json({ ok: false }, { status: 405 });
}
