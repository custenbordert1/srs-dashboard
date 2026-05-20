import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { guardBreezyCandidatesDebugResult } from "@/lib/auth/breezy-territory-guard";
import { fetchBreezyCandidatesDebug } from "@/lib/breezy-api";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { blockBreezyWriteRoute } from "@/lib/security/read-only";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/breezy/candidates/debug";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "breezy_candidates_debug_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim() ?? "2026-05-12";
  const to = searchParams.get("to")?.trim() ?? "2026-05-20";
  const includeClosed = searchParams.get("includeClosed") === "true";
  const includeArchived = searchParams.get("includeArchived") === "true";
  const force = searchParams.get("force") === "true";
  const pageSize = Number.parseInt(searchParams.get("page_size") ?? "", 10);
  const maxPages = Number.parseInt(searchParams.get("max_pages") ?? "", 10);
  const maxClosedPositions = Number.parseInt(searchParams.get("max_closed_positions") ?? "", 10);

  const raw = await fetchBreezyCandidatesDebug({
    dateRangeStart: from,
    dateRangeEnd: to,
    includeClosed,
    includeArchived,
    force,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
    maxClosedPositions: Number.isFinite(maxClosedPositions) ? maxClosedPositions : undefined,
  });

  const result = guardBreezyCandidatesDebugResult(raw, session);

  const status = result.ok ? 200 : breezyFailureHttpStatus(result.error);
  logBreezyRouteResult(ROUTE, status, {
    role: session.role,
    breezyOk: result.ok,
    candidateCount: result.ok ? result.candidates.length : 0,
    candidatesInDateRange: result.ok ? result.candidatesInDateRange : undefined,
  });

  const parityTotal = result.ok
    ? (result.publishedCandidatesInRange ?? 0) +
      (result.closedCandidatesInRange ?? 0) +
      (result.archivedCandidatesInRange ?? 0)
    : undefined;

  return NextResponse.json(
    result.ok
      ? {
          ...result,
          cached: !force,
          comparison: {
            breezyUiDateField: "Added Date (creation_date)",
            requestedRange: { from, to },
            includeClosed,
            includeArchived,
            expectedUiCount: 51,
            apiParityTotalBeforeTerritory: parityTotal,
            apiCandidatesInRangeAfterTerritory: result.candidatesInDateRange,
            gapVsBreezyUi:
              parityTotal !== undefined ? 51 - parityTotal : undefined,
            territoryRole: session.role,
          },
        }
      : result,
    {
      status,
      headers: {
        "Cache-Control": force ? "no-store" : "private, max-age=300, stale-while-revalidate=60",
      },
    },
  );
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
  });
  if (isGuardFailure(guard)) return guard;
  return blockBreezyWriteRoute(request, guard.session) ?? NextResponse.json({ ok: false }, { status: 405 });
}
