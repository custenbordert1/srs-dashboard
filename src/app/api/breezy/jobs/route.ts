import { guardBreezyJobsResult } from "@/lib/auth/breezy-territory-guard";
import { getSessionFromRequest } from "@/lib/auth/request-session";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { assertBreezyConfigured, logBreezyRouteResult, logBreezyRouteStart } from "@/lib/breezy-route-log";
import { breezyFailureHttpStatus } from "@/lib/breezy-http-status";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/breezy/jobs";

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
  const state = searchParams.get("state")?.trim() || "published";
  const result = guardBreezyJobsResult(await fetchBreezyJobs(state), session);
  const status = result.ok ? 200 : breezyFailureHttpStatus(result.error);
  logBreezyRouteResult(ROUTE, status, {
    role: session.role,
    breezyOk: result.ok,
    jobCount: result.ok ? result.jobs.length : 0,
  });
  return NextResponse.json(result, { status });
}
