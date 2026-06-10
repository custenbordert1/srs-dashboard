import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { fetchOrgAtsReportingBundle } from "@/lib/breezy-ats-reporting";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureBody, breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/ats-reporting";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_ats_reporting",
  });
  if (isGuardFailure(guard)) return guard;

  await logBreezyRouteStart(ROUTE, guard.session);
  const breezyCheck = await assertBreezyConfigured(ROUTE);
  if (!breezyCheck.ok) {
    return NextResponse.json({ ok: false, error: breezyCheck.error }, { status: breezyCheck.status });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  const bundle = await fetchOrgAtsReportingBundle({ force });

  if (!bundle.ok) {
    const status = breezyFailureHttpStatus(bundle.error);
    logBreezyRouteResult(ROUTE, status, { role: guard.session.role, breezyOk: false });
    return NextResponse.json(breezyFailureBody({ ok: false, error: bundle.error, fetchedAt: new Date().toISOString() }), {
      status,
    });
  }

  logBreezyRouteResult(ROUTE, 200, {
    role: guard.session.role,
    breezyOk: true,
    candidatesLoaded: bundle.ats.candidatesLoaded,
    publishedJobs: bundle.ats.publishedJobs,
    partial: bundle.ats.partialSync,
  });

  return NextResponse.json(
    {
      ok: true,
      ats: bundle.ats,
      refreshedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": force ? "no-store" : "private, max-age=45, stale-while-revalidate=90",
      },
    },
  );
}
