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
  const state = searchParams.get("state")?.trim() || undefined;
  const pageSize = Number.parseInt(searchParams.get("page_size") ?? "", 10);
  const maxPages = Number.parseInt(searchParams.get("max_pages") ?? "", 10);
  const maxPositions = Number.parseInt(searchParams.get("max_positions") ?? "", 10);

  const raw = await fetchBreezyCandidatesDebug({
    dateRangeStart: from,
    dateRangeEnd: to,
    state,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
    maxPositions: Number.isFinite(maxPositions) ? maxPositions : undefined,
  });

  const result = guardBreezyCandidatesDebugResult(raw, session);

  const status = result.ok ? 200 : breezyFailureHttpStatus(result.error);
  logBreezyRouteResult(ROUTE, status, {
    role: session.role,
    breezyOk: result.ok,
    candidateCount: result.ok ? result.candidates.length : 0,
    candidatesInDateRange: result.ok ? result.candidatesInDateRange : undefined,
  });

  return NextResponse.json(
    result.ok
      ? {
          ...result,
          comparison: {
            breezyUiDateField: "Added Date (creation_date)",
            requestedRange: { from, to },
            expectedUiCountHint:
              "Breezy UI reported ~51 candidates for 2026-05-12–2026-05-20; compare candidatesInDateRange after territory filter.",
            apiCandidatesInRangeBeforeTerritory: raw.ok ? raw.candidatesInDateRange : undefined,
            apiCandidatesInRangeAfterTerritory: result.candidatesInDateRange,
            territoryRole: session.role,
          },
        }
      : result,
    {
      status,
      headers: { "Cache-Control": "no-store" },
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
