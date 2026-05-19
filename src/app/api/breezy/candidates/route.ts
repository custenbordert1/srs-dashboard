import { guardBreezyCandidatesResult } from "@/lib/auth/breezy-territory-guard";
import { getSessionFromRequest } from "@/lib/auth/request-session";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/breezy/candidates";

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const positionId = searchParams.get("position_id")?.trim() || undefined;
  const state = searchParams.get("state")?.trim() || undefined;
  const pageSize = Number.parseInt(searchParams.get("page_size") ?? "", 10);
  const maxPages = Number.parseInt(searchParams.get("max_pages") ?? "", 10);
  const maxPositions = Number.parseInt(searchParams.get("max_positions") ?? "", 10);

  const result = guardBreezyCandidatesResult(
    await fetchBreezyCandidates({
      positionId,
      state,
      pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
      maxPages: Number.isFinite(maxPages) ? maxPages : undefined,
      maxPositions: Number.isFinite(maxPositions) ? maxPositions : undefined,
    }),
    session,
  );
  const status = result.ok ? 200 : breezyFailureHttpStatus(result.error);
  logBreezyRouteResult(ROUTE, status, {
    role: session.role,
    breezyOk: result.ok,
    candidateCount: result.ok ? result.candidates.length : 0,
  });
  return NextResponse.json(result, { status });
}
