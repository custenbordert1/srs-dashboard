import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { guardBreezyCandidatesResult } from "@/lib/auth/breezy-territory-guard";
import {
  buildBreezyCandidatesHealthProbe,
  peekBreezyCandidatesCache,
  resolveBreezyCompany,
} from "@/lib/breezy-api";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { blockBreezyWriteRoute } from "@/lib/security/read-only";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
/** Health probe must respond immediately — never wait on full closed-position or parity scans. */
export const maxDuration = 30;

const ROUTE = "/api/breezy/candidates/health";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "breezy_candidates_health_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const cached = peekBreezyCandidatesCache();
  const companyResult = await resolveBreezyCompany();
  if (!companyResult.ok) {
    const status = breezyFailureHttpStatus(companyResult.error);
    logBreezyRouteResult(ROUTE, status, { role: session.role, breezyOk: false });
    return NextResponse.json(companyResult, { status });
  }

  const probe = buildBreezyCandidatesHealthProbe(cached, companyResult);
  const guarded = guardBreezyCandidatesResult(probe, session);
  const status = guarded.ok ? 200 : breezyFailureHttpStatus(guarded.error);
  logBreezyRouteResult(ROUTE, status, {
    role: session.role,
    breezyOk: guarded.ok,
    candidateCount: guarded.ok ? guarded.candidates.length : 0,
    fromCache: probe.fromCache ?? false,
    partial: probe.partial ?? false,
  });

  return NextResponse.json(guarded, {
    status,
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
    },
  });
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
  });
  if (isGuardFailure(guard)) return guard;
  return blockBreezyWriteRoute(request, guard.session) ?? NextResponse.json({ ok: false }, { status: 405 });
}
