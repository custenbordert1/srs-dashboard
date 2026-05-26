import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { guardBreezyJobsResult } from "@/lib/auth/breezy-territory-guard";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { blockBreezyWriteRoute } from "@/lib/security/read-only";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/breezy/jobs";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "breezy_jobs_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  await logBreezyRouteStart(ROUTE, session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const state = searchParams.get("state")?.trim() || "published";
  const result = guardBreezyJobsResult(await fetchBreezyJobs(state), session);
  const status = result.ok ? 200 : breezyFailureHttpStatus(result.error);
  logBreezyRouteResult(ROUTE, status, {
    role: session.role,
    breezyOk: result.ok,
    jobCount: result.ok ? result.jobs.length : 0,
  });
  return NextResponse.json(result, {
    status,
    headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
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
